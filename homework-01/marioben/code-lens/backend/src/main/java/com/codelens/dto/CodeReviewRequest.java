package com.codelens.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CodeReviewRequest {

    @NotBlank(message = "Snippet 1 must not be empty")
    private String snippet1;

    @NotBlank(message = "Snippet 2 must not be empty")
    private String snippet2;

    private String language;
}
