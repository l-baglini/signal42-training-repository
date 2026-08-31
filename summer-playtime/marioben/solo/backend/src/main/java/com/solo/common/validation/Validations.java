package com.solo.common.validation;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Plain, framework-free validation helpers used by the per-controller validation services. Each
 * {@code require*} method throws {@link IllegalArgumentException} on failure — mapped to HTTP 400 by
 * {@code ValidationExceptionHandler}.
 */
public final class Validations {

    private Validations() {
    }

    // local-part@domain.tld — requires a TLD of at least 2 chars, no spaces
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile(
                    "^[A-Za-z0-9+_.-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\\.[A-Za-z]{2,}$");
    private static final int EMAIL_MAX_LENGTH = 300;

    private static final int PASSWORD_MIN_LENGTH = 6;

    public static void requireNotBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }

    public static void requireNotNull(Object value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " must not be null");
        }
    }

    public static void requireEmail(String value, String field) {
        requireNotBlank(value, field);
        if (value.length() > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException(field + " is not a valid email");
        }
    }

    public static void requirePassword(String value, String field) {
        requireNotBlank(value, field);
        if (value.length() < PASSWORD_MIN_LENGTH) {
            throw new IllegalArgumentException(
                    field + " must be at least " + PASSWORD_MIN_LENGTH + " characters");
        }
    }

    public static void requireOneOf(String value, Set<String> allowed, String field) {
        requireNotBlank(value, field);
        if (!allowed.contains(value)) {
            throw new IllegalArgumentException(field + " must be one of " + allowed);
        }
    }
}
