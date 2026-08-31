package com.solo.message.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.solo.message.dto.AttachmentDto;
import com.solo.message.dto.MessageDto;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/**
 * Writes a message's content to S3, following the "S3 as object storage, DB as index" pattern:
 *
 * <pre>
 * messages/&lt;userDetailId&gt;/day=&lt;yyyyMMdd&gt;/&lt;chatId&gt;/&lt;messageId&gt;/
 *   message.json          - text + attachment metadata, always present
 *   attachments/
 *     &lt;attachmentId&gt;.jpg  - original file, uploaded as-is (no base64, no re-encoding)
 *     &lt;attachmentId&gt;.pdf
 * </pre>
 * <p>
 * Every object for a message lives under one prefix, so deleting a message later is just
 * "delete everything under this prefix" — no need to know its content up front. The {@code
 * day=yyyyMMdd} segment uses Hive-style partition naming so a retention policy, or an
 * Athena/Spark query, can target a date range as a plain prefix match, without the backend having
 * to enumerate messages itself. Uniqueness within a day comes from {@code chatId}/{@code
 * messageId}, not from the date segment.
 *
 * <p>This class only writes to S3. The caller ({@code MessageQueueService}) is responsible for
 * persisting the returned prefix in the {@code message} table, which is what makes the message
 * findable and deletable — S3 itself is never queried like a database.
 */
@Service
public class MessageStorageService {

    private static final DateTimeFormatter DATE_PATH = DateTimeFormatter.ofPattern("'day='yyyyMMdd");

    // How long a recovered attachment's URL stays valid: long enough for the client to download it
    // right after recovery, short enough that a leaked link doesn't stay live indefinitely (the
    // bucket has no public access otherwise, see S3Config).
    private static final Duration ATTACHMENT_URL_TTL = Duration.ofMinutes(30);

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final ObjectMapper objectMapper;
    private final String bucket;

    public MessageStorageService(
            S3Client s3Client,
            S3Presigner s3Presigner,
            ObjectMapper objectMapper,
            @Value("${aws.s3.bucket}") String bucket) {
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
        this.objectMapper = objectMapper;
        this.bucket = bucket;
    }

    /**
     * Uploads {@code message.json} and all its attachments to S3 and returns the prefix they were
     * stored under (to be saved as {@code message.s3_prefix}).
     *
     * @param attachmentFiles the uploaded files from the multipart request, keyed by attachment id
     *                        (see {@code MessageController#sync}); every id in {@code message.attachments()} must have
     *                        a matching entry — {@code MessageValidationService} guarantees that before this runs.
     */
    public String store(
            Long userDetailId, String chatId, MessageDto message, Map<String, MultipartFile> attachmentFiles) {
        // convert date of creation message
        OffsetDateTime createdAt = Instant.ofEpochMilli(message.createdAt()).atOffset(ZoneOffset.UTC);
        // create prefix
        String prefix =
                "messages/%s/%s/%s/%s"
                        .formatted(userDetailId, DATE_PATH.format(createdAt), chatId, message.id());

        // for every attachment, upload it to S3S and return locations
        List<StoredAttachment> stored =
                message.attachments().stream()
                        .map(attachment -> uploadAttachment(prefix, attachment, attachmentFiles.get(attachment.id())))
                        .toList();

        MessageDocument document =
                new MessageDocument(
                        message.id(),
                        chatId,
                        createdAt.toString(),
                        stored.isEmpty() ? "text" : "mixed",
                        message.text(),
                        message.description(),
                        stored);

        putJson(prefix + "/message.json", document);

        return prefix;
    }

    /**
     * Rewrites just the {@code description} of an already-synced message (see
     * {@code MessageQueueService#updateDescription}, driven by long-press "aggiungi descrizione"
     * in the app): reads the existing {@code message.json}, replaces its description, writes the
     * whole document back to the same key. Everything else in the document (text, attachments,
     * timestamps) is preserved as-is — this never touches attachment objects themselves.
     */
    public void updateDescription(String prefix, String description) {
        ResponseBytes<GetObjectResponse> response =
                s3Client.getObjectAsBytes(
                        GetObjectRequest.builder().bucket(bucket).key(prefix + "/message.json").build());
        MessageDocument existing;
        try {
            existing = objectMapper.readValue(gunzip(response.asByteArray()), MessageDocument.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to parse message.json at " + prefix, e);
        }
        MessageDocument updated =
                new MessageDocument(
                        existing.id(),
                        existing.conversationId(),
                        existing.createdAt(),
                        existing.type(),
                        existing.content(),
                        description,
                        existing.attachments());
        putJson(prefix + "/message.json", updated);
    }

    private StoredAttachment uploadAttachment(String prefix, AttachmentDto attachment, MultipartFile file) {
        String key = "%s/attachments/%s%s".formatted(prefix, attachment.id(), extensionFor(attachment));
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(attachment.contentType())
                            .contentLength(file.getSize())
                            .build(),
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read attachment " + attachment.id(), e);
        }
        return new StoredAttachment(attachment.id(), key, attachment.contentType(), file.getSize());
    }

    /**
     * Reads a message back from S3 for recovery (see {@code com.solo.recovery}): fetches {@code
     * message.json} from under {@code prefix} and presigns a short-lived GET URL for each
     * attachment, since the bucket has no public access.
     *
     * @throws RuntimeException (unchecked, from the AWS SDK) if the object doesn't exist or is
     *                          unreadable — callers should treat that as "this one message can't be recovered", not fail
     *                          the whole batch, since S3 objects can in principle be missing/corrupt independently of the
     *                          DB row that points at them.
     */
    public LoadedMessage load(String prefix) {
        ResponseBytes<GetObjectResponse> response =
                s3Client.getObjectAsBytes(
                        GetObjectRequest.builder().bucket(bucket).key(prefix + "/message.json").build());
        MessageDocument document;
        try {
            document = objectMapper.readValue(gunzip(response.asByteArray()), MessageDocument.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to parse message.json at " + prefix, e);
        }
        List<LoadedAttachment> attachments = document.attachments().stream().map(this::presign).toList();
        return new LoadedMessage(document.content(), document.description(), attachments);
    }

    private LoadedAttachment presign(StoredAttachment attachment) {
        String url =
                s3Presigner
                        .presignGetObject(
                                GetObjectPresignRequest.builder()
                                        .signatureDuration(ATTACHMENT_URL_TTL)
                                        .getObjectRequest(
                                                GetObjectRequest.builder().bucket(bucket).key(attachment.key()).build())
                                        .build())
                        .url()
                        .toString();
        String filename = attachment.key().substring(attachment.key().lastIndexOf('/') + 1);
        return new LoadedAttachment(attachment.id(), url, attachment.contentType(), filename);
    }

    // Content of one recovered message: text plus its attachments, each with a ready-to-use
    // presigned URL. Deliberately separate from MessageDto/AttachmentDto (the sync-time input
    // shapes) and from RecoveredMessageDto/RecoveredAttachmentDto (the API-facing output shapes) —
    // this is just what MessageStorageService itself knows how to produce from S3.
    public record LoadedAttachment(String id, String url, String contentType, String filename) {
    }

    public record LoadedMessage(String text, String description, List<LoadedAttachment> attachments) {
    }

    private void putJson(String key, Object body) {
        byte[] json;
        try {
            json = objectMapper.writeValueAsBytes(body);
        } catch (JsonProcessingException e) {
            // Only happens if MessageDocument itself is unserializable, i.e. a programming error.
            throw new IllegalStateException("Failed to serialize " + key, e);
        }
        byte[] gzipped = gzip(json);
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType("application/json")
                        .contentEncoding("gzip")
                        .build(),
                RequestBody.fromBytes(gzipped));
    }

    // message.json is plain text (JSON) and compresses well (typically 60-80% smaller), so it's
    // stored gzip-compressed with the standard Content-Encoding header. The S3 SDK doesn't
    // decompress on read (that's an HTTP-client/browser behavior, not S3's), so load() has to
    // gunzip explicitly — see gunzip below.
    private static byte[] gzip(byte[] data) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(data);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static byte[] gunzip(byte[] data) throws IOException {
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(data))) {
            return gzip.readAllBytes();
        }
    }

    // Prefers the extension from the original filename; falls back to a small known-type table so
    // we still get a sensible key even if the client didn't send one.
    private static String extensionFor(AttachmentDto attachment) {
        String filename = attachment.filename();
        if (filename != null) {
            int dot = filename.lastIndexOf('.');
            if (dot >= 0 && dot < filename.length() - 1) {
                return filename.substring(dot);
            }
        }
        return switch (attachment.contentType()) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "application/pdf" -> ".pdf";
            default -> "";
        };
    }

    // On-disk shape of message.json: the single source of truth for a message's content. Kept
    // separate from the API-facing AttachmentDto/MessageDto on purpose — this is what's persisted,
    // those are what the client sends, and the two are free to evolve independently.
    private record StoredAttachment(String id, String key, String contentType, long size) {
    }

    private record MessageDocument(
            String id,
            String conversationId,
            String createdAt,
            String type,
            String content,
            String description,
            List<StoredAttachment> attachments) {
    }
}
