ROLE                                                                                                                                                    
  You are a senior full-stack engineer with strong experience in agentic                                                                                  
  LLM systems, web scraping/retrieval, and clean Python backend architecture.                                                                             
                                                                                                                                                          
  CONTEXT                                                                                                                                                 
  I'm a data/software/DevOps engineer who wants to stay current on specific                                                                               
  technical topics (e.g. Spark, Kubernetes, Go) without manually trawling                                                                                 
  sources. My pain point is missing important updates and falling behind on                                                                               
  trends.                                                                                                                                                 
                                                                                                                                                          
  GOAL                                                                                                                                                    
  Build a web app: a React frontend over a Python backend that, for each                                                                                  
  topic I follow, periodically searches the web for the latest news, updates,                                                                             
  releases, and relevant papers, and produces cited, study-ready digests.                                                                                 
                                                                                                                                                          
  CORE DATA MODEL (important)                                                                                                                             
  Two levels:                                                                                                                                             
  - TOPIC: a thing I follow, e.g. "Spark", "Kubernetes", "Go".                                                                                            
  - FINDING / DIGEST: a specific development under a topic, e.g. under                                                                                    
    "Spark" -> "DataFusion Comet", "Apache Gluten". Each finding is its own                                                                               
    LLM-generated digest with its own sources, citations, and images.                                                                                     
  So the structure is: Spark -> [Comet digest, Gluten digest, ...].                                                                                       
  The system must detect distinct findings within a topic and produce one                                                                                 
  digest per finding (not one blob per topic).                                                                                                            
                                                                                                                                                          
  STACK (fixed)                                                                                                                                           
  - Frontend: React (the UI framework).                                                                                                                   
  - Backend: Python.                                                                                                                                      
  - LLM: Anthropic Claude API (via the official anthropic Python SDK).                                                                                    
  - Primary database: PostgreSQL (relational data + the Topic/Finding model).                                                                             
  - Local deployment: Docker Compose (one `docker compose up` brings up all                                                                               
    services).                                                                                                                                            
  - You choose the rest (web framework, async layer, ORM/migrations,                                                                                      
    search/retrieval API, libraries) and justify each choice briefly.                                                                                     
                                                                                                                                                          
  OPTIONAL DATA STORES (use ONLY if justified — do not add by default)                                                                                    
  - Document store (e.g. MongoDB): consider ONLY if raw scraped text/source                                                                               
    blobs are genuinely better stored outside Postgres. Default to Postgres                                                                               
    (TEXT / JSONB) unless you give a concrete reason MongoDB is needed. If you                                                                            
    add it, justify it and wire it into Compose.                                                                                                          
  - Vector store (e.g. Qdrant): consider ONLY if semantic retrieval, semantic                                                                             
    dedup, or finding-detection genuinely benefit from embeddings vs. simpler                                                                             
    approaches (URL/title dedup, keyword clustering, or letting Claude judge).                                                                            
    State the trade-off and only include it if the benefit is real; if so,                                                                                
    wire it into Compose and say which embedding model you use.                                                                                           
                                                                                                                                                          
  CLAUDE AGENT (ReAct loop — note: "ReAct" here = the reason/act agent                                                                                    
  pattern, NOT the React frontend)                                                                                                                        
  - Implement the digest-producing agent as a ReAct-style loop:                                                                                           
    Thought -> Action -> Observation, repeated until done. The agent reasons                                                                              
    about what it has, calls TOOLS (e.g. web/search query, fetch-and-extract                                                                              
    page text, optional vector lookup if Qdrant is used), observes results,                                                                               
    and decides the next action before writing the final digest. This lets it                                                                             
    fill gaps (fetch a source, notice something missing, search again) rather                                                                             
    than summarizing in one shot.                                                                                                                         
  - Define the tool set available to the agent and the loop's stopping                                                                                    
    conditions and max-iteration guard.                                                                                                                   
  - Choose the Claude model and justify it (cost vs. quality). Use the                                                                                    
    anthropic Python SDK with tool use; handle long inputs, retries, and rate                                                                             
    limits sensibly.                                                                                                                                      
  - INCLUDE THE ACTUAL SYSTEM PROMPT for the agent, as a clearly labeled,                                                                                 
    editable constant. It should instruct Claude to: write for an experienced                                                                             
    engineer, be technical and concise, cite every claim with its source,                                                                                 
    never fabricate sources or facts, output a defined structure (what                                                                                    
    changed / why it matters / technical details / sources), use its tools to                                                                             
    verify before writing, and flag uncertainty. Briefly explain your                                                                                     
    prompt-design choices.                                                                                                                                
                                                                                                                                                          
  FUNCTIONAL REQUIREMENTS                                                                                                                                 
  - I add/remove topics (free-text tags like "spark", "kubernetes").                                                                                      
  - A scheduled job (configurable, default daily) runs per topic.                                                                                         
  - Source discovery must prioritize authoritative sources: official docs,                                                                                
    release notes, GitHub releases, maintainers' blogs, arXiv/papers, and                                                                                 
    reputable engineering blogs. De-duplicate and rank by authority + recency.                                                                            
    Explain your ranking/dedup strategy.                                                                                                                  
  - Within a topic, group retrieved material into distinct FINDINGS, and                                                                                  
    produce one digest per finding, each with:                                                                                                            
      * a title (the finding name, e.g. "DataFusion Comet")                                                                                               
      * a structured, study-ready summary                                                                                                                 
      * inline source citations with links                                                                                                                
      * relevant images where available, with attribution. Specify how images                                                                             
        are discovered, stored/proxied, and rendered.                                                                                                     
  - Avoid regenerating digests for findings already covered; detect what's new.                                                                           
                                                                                                                                                          
  BACKEND DESIGN                                                                                                                                          
  - Pick the Python web framework (e.g. FastAPI) and justify against async                                                                                
    I/O for many concurrent web requests, agent orchestration, and                                                                                        
    maintainability.                                                                                                                                      
  - Design the PostgreSQL schema for the Topic -> Finding/Digest model                                                                                    
    (Topic, Finding/Digest, Source, Image, read-state); choose ORM +                                                                                      
    migration tool. Explain how raw sources, digests, and images are stored,                                                                              
    and how any optional store (Mongo/Qdrant) fits in if used.                                                                                            
  - Specify the web-search / retrieval API you assume; call out where cost or                                                                             
    rate limits matter (search and Claude). Assume I provide all keys,                                                                                    
    including ANTHROPIC_API_KEY, via env vars.                                                                                                            
  - Architect in clear modules (source-discovery, fetch, rank/dedup,                                                                                      
    finding-detection, agent, scheduler, API layer). Best practices: type                                                                                 
    hints, error handling, centralized config, logging, and unit tests for                                                                                
    the ranking, finding-detection, and agent-loop control logic.                                                                                         
                                                                                                                                                          
  FRONTEND DESIGN                                                                                                                                         
  - React app: a list of my topics; selecting a topic shows its digests                                                                                   
    (findings) ordered by date; selecting a digest shows the full summary                                                                                 
    with images, sources/citations, and a read/unread toggle.                                                                                             
  - State your choices for build tooling, state management, and API access.                                                                               
                                                                                                                                                          
  DEPLOYMENT                                                                                                                                              
  - Provide docker-compose.yml with services for Postgres (persistent                                                                                     
    volume), the backend, the frontend, and any justified optional store                                                                                  
    (Mongo/Qdrant), wired via env vars. Include how migrations run on startup                                                                             
    and how I pass API keys. README: clone to running via `docker compose up`                                                                             
    plus a documented .env file.                                                                                                                          
                                                                                                                                                          
  PROCESS — do this in order, do NOT skip to code:                                                                                                        
  1. Ask clarifying questions ONLY if a decision is genuinely blocking.                                                                                   
     Otherwise, state assumptions explicitly and proceed.                                                                                                 
  2. Propose the architecture: component diagram (described), data model,                                                                                 
     which optional stores (if any) you're including and why, module                                                                                      
     breakdown, the React<->Python API contract, the source-discovery/ranking                                                                             
     strategy, the finding-detection approach, and the agent's tool set and                                                                               
     loop design. Pause for my approval before code.                                                                                                      
  3. After approval, implement module by module, with a README covering setup,                                                                            
     env vars, and the Docker Compose workflow.                                                                                                           
                                                                                                                                                          
  ACCEPTANCE CRITERIA                                                                                                                                     
  - `docker compose up` brings up the full stack locally per the README.                                                                                  
  - Adding a topic and triggering a run produces, under that topic, one or                                                                                
    more named digests, each with a summary, working source links, and images                                                                             
    where available.                                                                                                                                      
  - The code is modular; ranking, finding-detection, and agent-loop logic are                                                                             
    unit-tested. Read CLAUDE.md — that's the full project context.                                                                                        
                                                                                                                                                          
  We're at step 2: propose the architecture before any code. I want:                                                                                      
  - a component diagram (described in text)                                                                                                               
  - the PostgreSQL schema for the Topic → Finding/Digest model                                                                                            
    (Topic, Finding/Digest, Source, Image, read-state)                                                                                                    
  - the module breakdown and how data flows through the pipeline                                                                                          
  - the React ↔ Python API contract                                                                                                                       
  - the source-discovery + authority/recency ranking + dedup strategy                                                                                     
  - the finding-detection approach                                                                                                                        
  - the ReAct agent's tool set and loop design (with the max-iteration guard)                                                                             
                                                                                                                                                          
  For the decisions CLAUDE.md leaves open — web framework, ORM/migrations,                                                                                
  the runtime web-search API, and the scheduler (in-process vs separate                                                                                   
  worker) — recommend one each and justify briefly.                                                                                                       
                                                                                                                                                          
  For the optional stores (MongoDB, Qdrant): give me a yes/no with reasoning.                                                                             
  Default to NOT adding them unless there's a concrete win.                                                                                               
                                                                                                                                                          
  Use the library-researcher subagent to confirm current APIs before you                                                                                  
  commit to library choices. Ask me anything genuinely blocking; otherwise                                                                                
  state assumptions and proceed. Stop after the proposal — don't write code                                                                               
  until I approve.       