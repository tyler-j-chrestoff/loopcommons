# Story: Search Guidance — Learned Manifold Navigation

**Persona**: As a researcher, I need the evolutionary search to be guided by a learned model of the encounter-behavior correspondence, so generations converge faster, gaps are auto-identified, and the system can answer bidirectional queries (encounter → behavior families, target behavior → encounter families).

**Status**: planned

**Context**: Sessions 56-57 establish community fitness and co-evolution with blind mutation/crossover. The search guidance layer replaces that randomness with learned intuition. Three-model convergence (Claude/Gemini/Grok, session 55 discussion) identified the core architecture: encounters and behaviors live on two manifolds in a shared latent space. A surrogate model learns the correspondence between them, enabling forward queries (what solves this encounter?), inverse queries (what encounters test for this behavior?), and gap detection (where is the behavior space underexplored?).

**Prerequisites**: S56 (community fitness metrics define the behavior descriptor space) and S57 (co-evolution produces multi-population traces as training data) must complete first. The blind evolution baseline from S56-57 is what guided search needs to beat.

**Acceptance criteria**:
- Encounters encoded into continuous latent space preserving DSL compositional structure
- Agent behaviors encoded as vectors in the same shared space (fitness profiles across encounters)
- Surrogate model predicts fitness without running full evaluation (validated against held-out traces)
- Forward query: given encounter embedding, retrieve/generate family of high-fitness behavior profiles
- Inverse query: given target behavior profile, retrieve/generate community of encounters that produce it
- Gap detection: identify regions of behavior space with no archived elite (MAP-Elites holes)
- Guided generation outperforms blind mutation/crossover on convergence speed and final coverage

## Tasks

```jsonl
{"id":"sg-01","title":"Research: latent space optimization for DSLs","type":"research","status":"complete","description":"Three-model convergence (session 55 discussion) identified key approaches: (1) Grammar VAE / AST embeddings for DSL → continuous space (preserves compositional structure, decodes to valid DSL). (2) cVAE as primary architecture for bidirectional mapping. (3) Contrastive shared space (CLIP-style) as lightweight alternative. (4) GP surrogate for sparse data (hundreds of traces). (5) Normalizing flows for exact inversion if approximate cVAE insufficient. References: Grammar VAE (Kusner et al 2017), SOLVE (Gonzalez-Duque et al 2024), LPN (Latent Program Networks), FTL-IGM (few-shot inverse generative modeling).","estimate":"0min","deps":[],"prereqs":[]}
{"id":"sg-02","title":"Encounter DSL encoder","type":"implementation","status":"planned","description":"Parse encounter YAML DSL to AST. Encode AST via tree-structured encoder (Tree-LSTM or recursive NN) to continuous vector. Train on existing encounter corpus. Validate: nearby points in latent space correspond to semantically similar encounters. Consider Grammar VAE if generation from latent space needed.","estimate":"60min","deps":["sg-01"],"prereqs":[]}
{"id":"sg-03","title":"Behavior descriptor encoder","type":"implementation","status":"planned","description":"Encode agent behavior as vector: fitness scores across encounter battery, tool usage profile, death/survival pattern. This is the behavior descriptor for MAP-Elites. Normalize and project into shared latent space with encounter embeddings.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"sg-04","title":"GP surrogate for fitness prediction","type":"implementation","status":"planned","description":"Fit Gaussian Process on tournament traces: input = (encounter embedding, agent composition embedding), output = fitness score. GP provides uncertainty estimates. Start with GP before attempting cVAE — handles sparse data naturally, provides acquisition functions for active exploration. Validate on held-out traces from S56-57 tournaments.","estimate":"45min","deps":["sg-02","sg-03"],"prereqs":[]}
{"id":"sg-05","title":"Gap detection via acquisition function","type":"implementation","status":"planned","description":"Use GP uncertainty to identify underexplored regions of behavior space. High uncertainty = high information value = where to generate next. Implement Expected Improvement or Upper Confidence Bound acquisition over the MAP-Elites grid. Output: ranked list of behavior-space regions to target.","estimate":"30min","deps":["sg-04"],"prereqs":[]}
{"id":"sg-06","title":"Guided encounter generation","type":"implementation","status":"planned","description":"Replace blind mutation with latent-space-guided generation. Sample encounter candidates from high-acquisition-value regions, decode via Grammar VAE to valid DSL. Fall back to mutation for exploration. Compare convergence speed to S57 blind baseline.","estimate":"45min","deps":["sg-05"],"prereqs":[]}
{"id":"sg-07","title":"Bidirectional query API","type":"implementation","status":"planned","description":"Expose forward and inverse queries: (1) given encounter, return nearest behavior profiles (which compositions solve it?), (2) given target behavior, return nearest encounters (what tests for this?). Web endpoint for interactive exploration in observatory.","estimate":"30min","deps":["sg-04"],"prereqs":[]}
{"id":"sg-08","title":"Tests for search guidance","type":"test","status":"planned","description":"TDD: DSL encoder produces valid embeddings, GP surrogate predicts held-out fitness within bounds, acquisition function ranks uncertain regions higher, guided generation produces valid DSL, bidirectional queries return semantically coherent results.","estimate":"45min","deps":["sg-02","sg-03","sg-04","sg-05","sg-06","sg-07"],"prereqs":[]}
{"id":"sg-09","title":"Guided vs blind tournament comparison","type":"test","status":"planned","description":"Run guided tournament (4 agents, 3 gens) side-by-side with blind baseline from S57. Key metrics: convergence speed (generations to coverage plateau), final coverage (MAP-Elites grid fill), composition diversity at convergence. Guided search should reach equivalent coverage in fewer generations.","estimate":"30min","deps":["sg-08"],"prereqs":["ANTHROPIC_API_KEY"]}
```
