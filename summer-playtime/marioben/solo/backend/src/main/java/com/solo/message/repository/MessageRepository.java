package com.solo.message.repository;

import com.solo.message.model.Message;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MessageRepository extends JpaRepository<Message, String> {

  // Backs the chats+messages recovery range query (see com.solo.recovery); indexed by
  // (fk_id_user_detail, created_at), see db/changelog/007-add-message-user-created-at-index.sql.
  List<Message> findByUserDetailIdAndCreatedAtBetweenOrderByCreatedAtAsc(
      Long userDetailId, OffsetDateTime from, OffsetDateTime to);

  // Backs PATCH /chats/{chatId}/messages/{id} (see MessageQueueService#updateDescription): all
  // three conditions together are also the ownership check — a message only resolves if it truly
  // belongs to both this chat and this user, no separate chat-ownership query needed.
  Optional<Message> findByIdAndChatIdAndUserDetailId(String id, String chatId, Long userDetailId);

  // Backs GET /chats/{chatId}/messages (see MessageQueueService#list). Ownership itself is
  // checked separately (chatRepository.existsByIdAndUserDetailId) before this runs, so an empty
  // result here unambiguously means "no messages yet", not "not yours".
  List<Message> findByChatIdAndUserDetailIdOrderByCreatedAtAsc(String chatId, Long userDetailId);
}
