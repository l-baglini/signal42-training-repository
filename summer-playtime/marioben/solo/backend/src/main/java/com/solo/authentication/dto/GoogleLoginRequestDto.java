package com.solo.authentication.dto;

/** Body of {@code POST /auth/google}: the ID token obtained client-side via Google Sign-In. */
public record GoogleLoginRequestDto(String idToken) {}
