package com.solo.authentication.repository;

import com.solo.authentication.model.UserDetail;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserDetailsRepository extends JpaRepository<UserDetail, Long> {

  @Query("select u from UserDetail u where u.deleted = false AND u.email = :email")
  Optional<UserDetail> findByUserEmail(String email);

  @Query("select count(u) > 0 from UserDetail u where u.deleted = false AND u.email = :email")
  boolean existsByUserEmail(String email);
}
