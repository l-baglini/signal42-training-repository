package com.solo.message.dto;

import java.util.List;

public record SyncMessagesRequestDto(List<MessageDto> messages) {}
