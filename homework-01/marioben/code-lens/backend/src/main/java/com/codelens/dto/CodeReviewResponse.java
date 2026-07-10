package com.codelens.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CodeReviewResponse {

    private SnippetReview snippet1;
    private SnippetReview snippet2;
    private String comparison;
    private String winner;
}
