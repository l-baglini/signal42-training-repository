package com.solo.search.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Wires a second datasource (Postgres+pgvector) alongside the app's primary MySQL one, used only
 * by {@code com.solo.search} for the local-AI message index (see SPEC.md §3.6).
 *
 * <p>Spring Boot auto-configures exactly one implicit {@code DataSource} from {@code
 * spring.datasource.*}. Adding a second explicit {@code DataSource} bean makes that ambiguous for
 * anything that autowires {@code DataSource} by type (JPA, Liquibase) unless one is marked {@code
 * @Primary} — so the MySQL one is re-declared here explicitly, bound to the exact same {@code
 * spring.datasource.*} properties as before, with no behavior change for the rest of the app.
 */
@Configuration
public class VectorDbConfig {

  @Primary
  @Bean
  @ConfigurationProperties("spring.datasource")
  public DataSourceProperties dataSourceProperties() {
    return new DataSourceProperties();
  }

  @Primary
  @Bean
  public DataSource dataSource(DataSourceProperties dataSourceProperties) {
    return dataSourceProperties.initializeDataSourceBuilder().build();
  }

  @Bean
  @ConfigurationProperties("vector.datasource")
  public DataSourceProperties vectorDataSourceProperties() {
    return new DataSourceProperties();
  }

  @Bean
  public DataSource vectorDataSource(
      @Qualifier("vectorDataSourceProperties") DataSourceProperties vectorDataSourceProperties) {
    return vectorDataSourceProperties.initializeDataSourceBuilder().build();
  }

  @Bean
  public JdbcTemplate vectorJdbcTemplate(@Qualifier("vectorDataSource") DataSource vectorDataSource) {
    return new JdbcTemplate(vectorDataSource);
  }
}
