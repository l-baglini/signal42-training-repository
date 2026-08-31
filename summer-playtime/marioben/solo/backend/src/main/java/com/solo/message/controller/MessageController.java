package com.solo.message.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.solo.authentication.model.AuthenticationToken;
import com.solo.chat.repository.ChatRepository;
import com.solo.exception.ChatNotFoundException;
import com.solo.message.dto.ListMessagesResponseDto;
import com.solo.message.dto.SyncMessagesRequestDto;
import com.solo.message.dto.UpdateMessageRequestDto;
import com.solo.message.service.MessageQueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartHttpServletRequest;

@RequiredArgsConstructor
@RestController
@RequestMapping("/chats")
public class MessageController {

    private final ChatRepository chatRepository;
    private final MessageQueueService messageQueueService;
    private final ObjectMapper objectMapper;

    /**
     * Batch sync endpoint, called as multipart/form-data with:
     *
     * <ul>
     *   <li>a "messages" part: the JSON body ({@code SyncMessagesRequestDto}), same shape as
     *       before, now with an optional {@code attachments} array per message
     *   <li>one file part per attachment, named exactly with the attachment's id, so the backend
     *       can match each uploaded file back to its metadata in "messages"
     * </ul>
     * <p>
     * The "messages" part is read as a plain string ({@code @RequestParam}, not {@code
     *
     * @RequestPart}) and parsed by hand: mobile HTTP clients (React Native's {@code FormData} in
     * particular) don't set a {@code Content-Type: application/json} header on plain text parts,
     * only on file parts — {@code @RequestPart} picks its converter from that header and would
     * reject the part instead of reading it as JSON. Reading it as a raw servlet request parameter
     * sidesteps that entirely, since the servlet container hands us its text regardless of any
     * per-part content type.
     */
    @PostMapping(value = "/{chatId}/messages/sync", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> sync(
            Authentication authentication,
            @PathVariable String chatId,
            @RequestParam("messages") String messagesJson,
            MultipartHttpServletRequest request) {
        // recover userId
        Long userId = ((AuthenticationToken) authentication).getDetails();

        // check if chat related to messages exists
        if (!chatRepository.existsByIdAndUserDetailId(chatId, userId)) {
            throw new ChatNotFoundException();
        }
        SyncMessagesRequestDto syncMessagesRequestDto = parseMessages(messagesJson);
        // for every message in the request, enqueue them to write in s3
        syncMessagesRequestDto.messages()
                .forEach(message -> messageQueueService.writeToStorage(userId, chatId, message, request.getFileMap()));
        return ResponseEntity.accepted().build();
    }

    SyncMessagesRequestDto parseMessages(String messagesJson) {
        try {
            return objectMapper.readValue(messagesJson, SyncMessagesRequestDto.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("messages is not valid JSON", e);
        }
    }

    /**
     * Updates the description of an already-synced message (long-press "aggiungi descrizione" in
     * the app). Messages not yet synced don't need this: their description just rides along in
     * the next {@code sync} call instead, see {@code MessageDto#description}.
     */
    @PatchMapping("/{chatId}/messages/{messageId}")
    public ResponseEntity<Void> updateDescription(
            Authentication authentication,
            @PathVariable String chatId,
            @PathVariable String messageId,
            @RequestBody UpdateMessageRequestDto dto) {
        Long userId = ((AuthenticationToken) authentication).getDetails();
        messageQueueService.updateDescription(userId, chatId, messageId, dto.description());
        return ResponseEntity.noContent().build();
    }

    /**
     * Lists a chat's messages with content read back from S3. Used by the web client to (re)load
     * a chat's thread on open/refresh, since it has no local database to keep history in between
     * page loads (see {@code MessageQueueService#list}).
     */
    @GetMapping("/{chatId}/messages")
    public ListMessagesResponseDto list(Authentication authentication, @PathVariable String chatId) {
        Long userId = ((AuthenticationToken) authentication).getDetails();
        return messageQueueService.list(userId, chatId);
    }
}
