package com.solo.message.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * Builds the {@link S3Client} used to store message content (see {@code MessageStorageService})
 * and the {@link S3Presigner} used to hand out short-lived, read-only attachment URLs when
 * recovering messages (see {@code com.solo.recovery}), since the bucket blocks all public access.
 */
@Configuration
public class S3Config {

  @Bean
  public S3Client s3Client(
      @Value("${aws.region}") String region,
      @Value("${aws.access-key-id:}") String accessKeyId,
      @Value("${aws.secret-access-key:}") String secretAccessKey) {
    return S3Client.builder()
        .region(Region.of(region))
        .credentialsProvider(credentialsProvider(accessKeyId, secretAccessKey))
        .build();
  }

  @Bean
  public S3Presigner s3Presigner(
      @Value("${aws.region}") String region,
      @Value("${aws.access-key-id:}") String accessKeyId,
      @Value("${aws.secret-access-key:}") String secretAccessKey) {
    return S3Presigner.builder()
        .region(Region.of(region))
        .credentialsProvider(credentialsProvider(accessKeyId, secretAccessKey))
        .build();
  }

  // aws.access-key-id/secret-access-key are meant to come from application-local.yml (gitignored
  // dev-only profile, see application-local.yml.example) so they never live in this codebase.
  // Left blank (the default), we fall back to the SDK's default credential chain, which is what
  // production uses via its IAM role.
  private static AwsCredentialsProvider credentialsProvider(String accessKeyId, String secretAccessKey) {
    if (accessKeyId.isBlank() || secretAccessKey.isBlank()) {
      return DefaultCredentialsProvider.create();
    }
    return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
  }
}
