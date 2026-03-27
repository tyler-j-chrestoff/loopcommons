# Chapter 5: Transformers as Bayesian Networks

Coppola's formal result (arxiv 2603.17063). Sigmoid transformers implement weighted loopy belief propagation. Attention = AND (gather evidence), FFN = OR (update beliefs). Proofs are Lean 4 verified with zero sorries. Critical limitation: proven for sigmoid, not softmax. Key implication: hallucination isn't noise in the training — it's what belief propagation does when the concept space isn't grounded. Make this accessible to someone who knows transformers but not graphical models.
