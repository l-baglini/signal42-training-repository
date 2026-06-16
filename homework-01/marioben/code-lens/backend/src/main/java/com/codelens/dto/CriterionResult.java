package com.codelens.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CriterionResult {

    private int score;
    private String observations;
    private List<String> suggestions;
}
