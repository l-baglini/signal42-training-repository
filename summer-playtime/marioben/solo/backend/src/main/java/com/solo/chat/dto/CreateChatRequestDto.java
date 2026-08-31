package com.solo.chat.dto;

public record CreateChatRequestDto(
    String id,
    String name,
    String icon,
    String color,
    Boolean favorite,
    boolean backup,
    String securityMode,
    String securityPinHash) {}
