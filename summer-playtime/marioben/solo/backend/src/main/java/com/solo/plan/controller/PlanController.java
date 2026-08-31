package com.solo.plan.controller;

import com.solo.plan.dto.PlanDto;
import com.solo.plan.service.PlanService;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes the available subscription plans.
 */
@RequiredArgsConstructor
@RestController
@RequestMapping("/plans")
public class PlanController {

    private final PlanService planService;

    /**
     * Lists all available plans.
     */
    @GetMapping
    public ResponseEntity<List<PlanDto>> getAll() {
        List<PlanDto> planDtoList = planService.getAll();
        return ResponseEntity.ok(planDtoList);
    }
}