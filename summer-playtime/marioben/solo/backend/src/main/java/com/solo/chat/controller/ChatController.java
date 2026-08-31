package com.solo.chat.controller;

import com.solo.authentication.model.AuthenticationToken;
import com.solo.chat.dto.ChatDto;
import com.solo.chat.dto.CreateChatRequestDto;
import com.solo.chat.dto.UpdateChatRequestDto;
import com.solo.chat.service.ChatService;
import com.solo.chat.validation.ChatValidationService;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RequiredArgsConstructor
@RestController
@RequestMapping("/chats")
public class ChatController {

    private final ChatService chatService;
    private final ChatValidationService chatValidationService;

    /**
     * Lists all chats belonging to the authenticated user.
     */
    @GetMapping
    public ResponseEntity<List<ChatDto>> list(Authentication authentication) {
        // recover userId
        Long userId = ((AuthenticationToken) authentication).getDetails();
        // recover all chats by userID
        List<ChatDto> userChatDtos = chatService.listForUser(userId);
        return ResponseEntity.ok(userChatDtos);
    }

    /**
     * Creates a new chat for the authenticated user.
     */
    @PostMapping
    public ResponseEntity<ChatDto> create(
            Authentication authentication, @RequestBody CreateChatRequestDto chatRequestDto) {
        // recover userId
        Long userId = ((AuthenticationToken) authentication).getDetails();
        // validation and create chat
        chatValidationService.validateCreate(chatRequestDto);
        ChatDto chatDto = chatService.create(userId, chatRequestDto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatDto);
    }

    /**
     * Updates the chat identified by {@code id}, if it belongs to the authenticated user.
     */
    @PatchMapping("/{id}")
    public ResponseEntity<ChatDto> update(
            Authentication authentication,
            @PathVariable String id,
            @RequestBody UpdateChatRequestDto dto) {
        // recover userId
        Long userId = ((AuthenticationToken) authentication).getDetails();
        // validation and update chat
        chatValidationService.validateUpdate(dto);
        ChatDto chatDtoUpdated = chatService.update(userId, id, dto);
        return ResponseEntity.ok(chatDtoUpdated);
    }

    /**
     * Deletes the chat identified by {@code id}, if it belongs to the authenticated user.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable String id) {
        // recover userId
        Long userId = ((AuthenticationToken) authentication).getDetails();
        // delete chat
        chatService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }
}
