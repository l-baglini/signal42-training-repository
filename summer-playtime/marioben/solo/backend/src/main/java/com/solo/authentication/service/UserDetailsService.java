package com.solo.authentication.service;

import com.solo.authentication.dto.AuthResponse;
import com.solo.authentication.dto.LoginRequestDto;
import com.solo.authentication.dto.RegisterRequestDto;
import com.solo.exception.EmailAlreadyExistsException;
import com.solo.exception.InvalidCredentialsException;
import com.solo.authentication.model.UserDetail;
import com.solo.authentication.repository.UserDetailsRepository;
import com.solo.security.service.JwtService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserDetailsService {

  private final UserDetailsRepository userDetailsRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  /**
   * Verifies the given credentials against a registered, enabled user and returns an auth token.
   *
   * @throws InvalidCredentialsException if the email is unknown, the user is disabled, or the
   *     password does not match
   */
  public AuthResponse login(LoginRequestDto request) {
    // find a user by email
    UserDetail userDetail =
        userDetailsRepository
            .findByUserEmail(request.email())
            .orElseThrow(InvalidCredentialsException::new);

    // check if a user is enabled and the password is correct
    if (!userDetail.isEnable()
        || !passwordEncoder.matches(request.password(), userDetail.getPassword())) {
      throw new InvalidCredentialsException();
    }

    // generate access token and response
    String token = jwtService.generateAccessToken(userDetail);
    return new AuthResponse(token, userDetail.getName());
  }

  /**
   * Creates a new, enabled user with an encoded password and returns an auth token.
   *
   * @throws EmailAlreadyExistsException if the email is already registered
   */
  @Transactional
  public AuthResponse createUser(RegisterRequestDto request) {
    // check if the email is already in use
    if (userDetailsRepository.existsByUserEmail(request.email())) {
      throw new EmailAlreadyExistsException("Email already in use");
    }

    // create a new user with null role and enable it
    UserDetail userDetail = new UserDetail();
    userDetail.setName(request.name());
    userDetail.setEmail(request.email());
    userDetail.setPassword(passwordEncoder.encode(request.password()));
    userDetail.setEnable(true);
    userDetail.setRole(null);

    // save on db
    userDetailsRepository.save(userDetail);

    // generate access token and response
    String token = jwtService.generateAccessToken(userDetail);
    return new AuthResponse(token, userDetail.getName());
  }
}
