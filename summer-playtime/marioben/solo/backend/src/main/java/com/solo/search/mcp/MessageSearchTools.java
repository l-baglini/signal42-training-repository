package com.solo.search.mcp;

import com.solo.search.service.MessageSearchService;
import com.solo.search.service.MessageSearchService.SearchHit;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Service;

/**
 * MCP tool exposing semantic search over the account owner's own messages (see {@code
 * MessageSearchService}). LM Studio's own "integrations" feature decides if/when to call this
 * while generating a chat response — this class only formats results into the text block the
 * model reads back, mirroring {@code KbSemanticSearchTools} from the quoak project this was
 * ported from.
 */
@Service
public class MessageSearchTools {

  // Similarity below this is treated as "not actually relevant" to avoid the model building an
  // answer on unrelated messages when nothing good matches.
  private static final double MIN_SIMILARITY = 0.5;

  private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

  private final MessageSearchService messageSearchService;

  public MessageSearchTools(MessageSearchService messageSearchService) {
    this.messageSearchService = messageSearchService;
  }

  @Tool(
      description =
          """
          Cerca informazioni nei messaggi personali dell'utente tramite ricerca semantica. Usalo
          per rispondere a qualunque domanda su cose che l'utente potrebbe aver scritto in passato
          in una delle sue chat (es. password, note, promemoria, informazioni personali). Passa
          come query la domanda dell'utente così com'è. Se non trovi nulla di pertinente,
          dichiaralo esplicitamente: non inventare mai un'informazione che non è nei risultati.
          """)
  public String cercaNeiMieiMessaggi(
      @ToolParam(description = "La domanda dell'utente in linguaggio naturale") String query) {
    List<SearchHit> hits;
    try {
      hits =
          messageSearchService.search(query).stream()
              .filter(hit -> hit.similarity() >= MIN_SIMILARITY)
              .toList();
    } catch (IllegalStateException e) {
      return "Ricerca non disponibile: " + e.getMessage();
    }

    if (hits.isEmpty()) {
      return "Nessun messaggio pertinente trovato per: \"" + query + "\".";
    }

    StringBuilder sb = new StringBuilder("Messaggi pertinenti trovati:\n");
    int i = 1;
    for (SearchHit hit : hits) {
      sb.append(i++)
          .append(". [chat: ")
          .append(hit.chatName())
          .append(", ")
          .append(hit.createdAt().format(DATE_FORMAT))
          .append("] ")
          .append(hit.text())
          .append('\n');
    }
    return sb.toString();
  }
}
