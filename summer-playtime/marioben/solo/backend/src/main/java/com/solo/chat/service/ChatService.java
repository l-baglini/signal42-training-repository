package com.solo.chat.service;

import com.solo.authentication.repository.UserDetailsRepository;
import com.solo.chat.dto.ChatDto;
import com.solo.chat.dto.CreateChatRequestDto;
import com.solo.chat.dto.UpdateChatRequestDto;
import com.solo.chat.model.Chat;
import com.solo.chat.repository.ChatRepository;
import com.solo.exception.ChatIdConflictException;
import com.solo.exception.ChatNotFoundException;
import jakarta.transaction.Transactional;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Manages chats: listing, creation, update, and deletion, scoped to their owning user.
 */
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRepository chatRepository;
    private final UserDetailsRepository userDetailsRepository;

    /**
     * Lists all chats belonging to the given user, ordered by creation date.
     */
    public List<ChatDto> listForUser(Long userDetailId) {
        return chatRepository.findByUserDetailIdOrderByCreatedAtAsc(userDetailId).stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Creates a new chat owned by the given user.
     *
     * @throws ChatIdConflictException if {@code dto.id()} is already taken. The id is
     *     client-generated (not a DB sequence), and {@link Chat} has no {@code @Version}/{@code
     *     Persistable}, so a plain {@code save()} on a pre-existing id would silently {@code
     *     merge()} into (and reassign ownership of) someone else's chat instead of inserting a new
     *     row — this check is what makes create() reject that instead.
     */
    @Transactional
    public ChatDto create(Long userDetailId, CreateChatRequestDto dto) {
        if (chatRepository.existsById(dto.id())) {
            throw new ChatIdConflictException();
        }
        Chat chat = new Chat();
        chat.setId(dto.id());
        chat.setUserDetail(userDetailsRepository.getReferenceById(userDetailId));
        chat.setName(dto.name());
        chat.setIcon(dto.icon());
        chat.setColor(dto.color());
        chat.setFavorite(Boolean.TRUE.equals(dto.favorite()));
        chat.setBackup(dto.backup());
        String securityMode = dto.securityMode() != null ? dto.securityMode() : "none";
        chat.setSecurityMode(securityMode);
        chat.setSecurityPinHash("pin".equals(securityMode) ? dto.securityPinHash() : null);
        return toDto(chatRepository.save(chat));
    }

    /**
     * Updates the non-null fields of the chat identified by {@code chatId}, if it belongs to the
     * given user.
     *
     * @throws ChatNotFoundException if no such chat exists for that user
     */
    @Transactional
    public ChatDto update(Long userDetailId, String chatId, UpdateChatRequestDto dto) {
        Chat chat =
                chatRepository
                        .findByIdAndUserDetailId(chatId, userDetailId)
                        .orElseThrow(ChatNotFoundException::new);

        if (dto.name() != null) chat.setName(dto.name());
        if (dto.icon() != null) chat.setIcon(dto.icon());
        if (dto.color() != null) chat.setColor(dto.color());
        if (dto.favorite() != null) chat.setFavorite(dto.favorite());
        if (dto.backup() != null) chat.setBackup(dto.backup());
        if (dto.securityMode() != null) {
            chat.setSecurityMode(dto.securityMode());
            chat.setSecurityPinHash("pin".equals(dto.securityMode()) ? dto.securityPinHash() : null);
        }
        return toDto(chatRepository.save(chat));
    }

    /**
     * Deletes the chat identified by {@code chatId}, if it belongs to the given user.
     *
     * @throws ChatNotFoundException if no such chat exists for that user
     */
    @Transactional
    public void delete(Long userDetailId, String chatId) {
        if (!chatRepository.existsByIdAndUserDetailId(chatId, userDetailId)) {
            throw new ChatNotFoundException();
        }
        chatRepository.deleteById(chatId);
    }

    /**
     * Maps a {@link Chat} entity to its DTO representation.
     */
    ChatDto toDto(Chat chat) {
        return new ChatDto(
                chat.getId(),
                chat.getName(),
                chat.getIcon(),
                chat.getColor(),
                chat.isFavorite(),
                chat.isBackup(),
                chat.getSecurityMode(),
                chat.getSecurityPinHash());
    }
}
