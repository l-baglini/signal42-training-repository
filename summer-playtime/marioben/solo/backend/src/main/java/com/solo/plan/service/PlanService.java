package com.solo.plan.service;

import com.solo.plan.dto.PlanDto;
import com.solo.plan.model.Plan;
import com.solo.plan.repository.PlanRepository;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Provides read access to the available subscription plans.
 */
@Service
@RequiredArgsConstructor
public class PlanService {

    private final PlanRepository planRepository;

    /**
     * Lists all plans, ordered by price ascending.
     */
    public List<PlanDto> getAll() {
        return planRepository.findAllByOrderByPriceAsc().stream().map(this::toDto).toList();
    }

    /**
     * Maps a {@link Plan} entity to its DTO representation.
     */
    PlanDto toDto(Plan plan) {
        return new PlanDto(plan.getId(), plan.getTitle(), plan.getDescription(), plan.getPrice());
    }
}