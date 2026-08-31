package com.solo.search.config;

import com.solo.search.mcp.MessageSearchTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpConfig {

  @Bean
  public ToolCallbackProvider messageSearchToolCallbacks(MessageSearchTools messageSearchTools) {
    return MethodToolCallbackProvider.builder().toolObjects(messageSearchTools).build();
  }
}
