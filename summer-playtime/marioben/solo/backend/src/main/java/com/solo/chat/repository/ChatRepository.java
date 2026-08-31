package com.solo.chat.repository;

import com.solo.chat.model.Chat;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatRepository extends JpaRepository<Chat, String> {

  List<Chat> findByUserDetailIdOrderByCreatedAtAsc(Long userDetailId);

  Optional<Chat> findByIdAndUserDetailId(String id, Long userDetailId);

  boolean existsByIdAndUserDetailId(String id, Long userDetailId);
}
