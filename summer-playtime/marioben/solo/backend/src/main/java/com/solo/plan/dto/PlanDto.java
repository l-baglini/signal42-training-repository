package com.solo.plan.dto;

import java.math.BigDecimal;

public record PlanDto(Long id, String title, String description, BigDecimal price) {}