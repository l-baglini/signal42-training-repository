package com.solo.chat.dto;

public record ChatDto(
    String id,
    String name,
    String icon,
    String color,
    boolean favorite,
    boolean backup,
    String securityMode,
    String securityPinHash) {}
