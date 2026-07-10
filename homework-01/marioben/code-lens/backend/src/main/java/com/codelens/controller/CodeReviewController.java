package com.codelens.controller;

import com.codelens.dto.CodeReviewRequest;
import com.codelens.dto.CodeReviewResponse;
import com.codelens.service.MistralService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class CodeReviewController {

    private final MistralService mistralService;

    @PostMapping("/review")
    public ResponseEntity<CodeReviewResponse> reviewCode(@Valid @RequestBody CodeReviewRequest request) {
        log.info("Received code review request, snippet1.length={}, snippet2.length={}",
                request.getSnippet1().length(), request.getSnippet2().length());

        CodeReviewResponse response = mistralService.reviewCode(request);
        return ResponseEntity.ok(response);
    }
}
