# DIL — Decision & Intent Language

## What DIL Is
DIL is an intent-oriented, AI-native language used to declare **verifiable intents** that govern the behavior of systems implemented by humans or AI.

DIL specifies *what must be achieved and why*, never *how it is implemented*.

## What DIL Is Not
- DIL is not a general-purpose programming language.
- DIL is not a configuration or deployment format.
- DIL does not encode execution logic, control flow, or algorithms.

## Foundational Axioms
The following axioms are non-negotiable:

1. **Intent Over Implementation**  
   Desired outcomes are declared explicitly; implementation is always delegated.

2. **Constraints Before Optimization**  
   A solution is invalid if it violates constraints, regardless of efficiency.

3. **Capabilities Before Actions**  
   Systems declare what they are capable of before any action is considered.

4. **Decisions Are First-Class Artifacts**  
   Every non-trivial choice must be explicit, attributable, and reviewable.

5. **Explainability Is Mandatory**  
   Every accepted solution must be explainable in terms of intent, constraints, and decisions.

6. **Errors Are Structured Information**  
   Failure states are declarative outputs, not exceptions.

7. **Change Is a First-Class Condition**  
   Intent declarations must assume that change will occur and remain valid under revision.

## Scope of DIL
DIL governs:
- intent declaration
- constraint definition
- decision traceability
- validation semantics

DIL explicitly excludes:
- execution engines
- runtimes
- user interfaces
- infrastructure concerns