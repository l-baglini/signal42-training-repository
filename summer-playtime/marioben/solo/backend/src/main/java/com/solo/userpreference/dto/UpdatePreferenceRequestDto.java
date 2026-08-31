package com.solo.userpreference.dto;

// PATCH semantics: every field is optional, null means "leave unchanged".
public record UpdatePreferenceRequestDto(Long planId) {}