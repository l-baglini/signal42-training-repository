package com.solo.userpreference.repository;

import com.solo.userpreference.model.UserPreference;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserPreferenceRepository extends JpaRepository<UserPreference, Long> {

  Optional<UserPreference> findByUserDetailId(Long userDetailId);
}
