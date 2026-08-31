package com.solo.authentication.service;

import java.util.Optional;

import com.solo.authentication.model.AuthenticationToken;
import com.solo.authentication.model.UserDetail;
import com.solo.authentication.repository.UserDetailsRepository;
import lombok.AllArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.core.convert.converter.Converter;
import org.springframework.lang.NonNull;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Converts a decoded JWT into an {@link AuthenticationToken} by loading the corresponding user
 * from the database.
 */
@Component
@AllArgsConstructor
@Log4j2
public class JwtTokenConverter implements Converter<Jwt, AuthenticationToken> {

    UserDetailsRepository userDetailsRepository;

    /**
     * Resolves the JWT subject to a user and wraps it into an {@link AuthenticationToken}.
     *
     * @throws AccessDeniedException if the subject is not a valid user id or no matching user
     *                               exists
     */
    @Override
    public AuthenticationToken convert(@NonNull Jwt jwtToken) {
        return getUserId(jwtToken.getSubject()) //extract user id from subject token
                .flatMap(
                        id -> {
                            Optional<UserDetail> userDetail = userDetailsRepository.findById(id);
                            if (userDetail.isPresent()) {
                                return userDetail;
                            } else {
                                log.warn("[SpringConfig] User Details not found!!! id: {}", id);
                                return Optional.empty();
                            }
                        })
                .map(user -> new AuthenticationToken(jwtToken, user)) // create new internal jwt token
                .orElseThrow(() -> new AccessDeniedException("Auth token not found"));
    }

    /**
     * Parses the JWT subject as a user id, returning empty if it is not a valid number.
     */
    Optional<Long> getUserId(String idAsString) {
        try {
            return Optional.of(Long.parseLong(idAsString));
        } catch (Exception ex) {
            log.warn("Cannot parse user id from jwt subject : {}", idAsString);
            return Optional.empty();
        }
    }
}
