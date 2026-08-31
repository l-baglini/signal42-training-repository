package com.solo.userpreference.service;

import com.solo.authentication.repository.UserDetailsRepository;
import com.solo.plan.model.Plan;
import com.solo.plan.repository.PlanRepository;
import com.solo.userpreference.dto.PreferenceDto;
import com.solo.userpreference.dto.UpdatePreferenceRequestDto;
import com.solo.userpreference.model.UserPreference;
import com.solo.userpreference.repository.UserPreferenceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserPreferenceService {

  private final UserPreferenceRepository userPreferenceRepository;
  private final UserDetailsRepository userDetailsRepository;
  private final PlanRepository planRepository;

  @Transactional
  public PreferenceDto get(Long userDetailId) {
    return toDto(getOrCreate(userDetailId));
  }

  @Transactional
  public PreferenceDto update(Long userDetailId, UpdatePreferenceRequestDto dto) {
    UserPreference preference = getOrCreate(userDetailId);
    if (dto.planId() != null) {
      Plan plan =
          planRepository
              .findById(dto.planId())
              .orElseThrow(() -> new IllegalArgumentException("Plan not found"));
      preference.setPlan(plan);
    }
    return toDto(userPreferenceRepository.save(preference));
  }

  private UserPreference getOrCreate(Long userDetailId) {
    return userPreferenceRepository
        .findByUserDetailId(userDetailId)
        .orElseGet(
            () -> {
              UserPreference preference = new UserPreference();
              preference.setUserDetail(userDetailsRepository.getReferenceById(userDetailId));
              return userPreferenceRepository.save(preference);
            });
  }

  private static PreferenceDto toDto(UserPreference preference) {
    Plan plan = preference.getPlan();
    return new PreferenceDto(plan != null ? plan.getId() : null);
  }
}