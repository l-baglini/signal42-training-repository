package com.solo.message.validation;

import com.solo.message.dto.AttachmentDto;
import com.solo.message.dto.MessageDto;
import com.solo.common.validation.Validations;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Validates each {@code MessageDto} of a sync request before it is written to S3. Keeps the
 * allowed content types narrow on purpose: these are the only kinds of attachment the app
 * currently understands (photos + PDFs), same as discussed for the S3 storage pattern.
 *
 * <p>File size is not re-checked here: {@code spring.servlet.multipart.max-file-size}
 * (application.yml) already rejects oversized parts before the request body is even parsed.
 */
@Service
public class MessageValidationService {

  private static final Set<String> ALLOWED_ATTACHMENT_TYPES =
      Set.of("image/jpeg", "image/png", "image/webp", "application/pdf");

  public void validate(MessageDto message, Map<String, MultipartFile> attachmentFiles) {
    Validations.requireNotNull(message, "message");
    Validations.requireNotBlank(message.id(), "id");
    if (message.attachments().isEmpty()) {
      // A message needs some content: if there's no attachment, it must at least have text.
      Validations.requireNotBlank(message.text(), "text");
    }
    message.attachments().forEach(attachment -> validateAttachment(attachment, attachmentFiles));
  }

  private void validateAttachment(AttachmentDto attachment, Map<String, MultipartFile> attachmentFiles) {
    Validations.requireNotBlank(attachment.id(), "attachments[].id");
    Validations.requireOneOf(attachment.contentType(), ALLOWED_ATTACHMENT_TYPES, "attachments[].contentType");

    MultipartFile file = attachmentFiles.get(attachment.id());
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException(
          "attachments[].id '" + attachment.id() + "' has no matching uploaded file part");
    }
  }
}
