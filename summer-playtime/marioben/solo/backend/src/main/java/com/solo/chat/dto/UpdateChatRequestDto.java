package com.solo.chat.dto;

// PATCH semantics: every field is optional, null means "leave unchanged".
public record UpdateChatRequestDto(
    String name,
    String icon,
    String color,
    Boolean favorite,
    Boolean backup,
    String securityMode,
    String securityPinHash) {}
