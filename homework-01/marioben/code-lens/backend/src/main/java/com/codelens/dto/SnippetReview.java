package com.codelens.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SnippetReview {

    private CriterionResult cleanliness;
    private CriterionResult security;
    private CriterionResult readability;
    private CriterionResult designPatterns;
    private int overallScore;
    private String summary;
}
