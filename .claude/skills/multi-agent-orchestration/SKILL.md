---
name: multi-agent-orchestration
description: "Design and implement multi-agent AI systems using LangGraph and Claude. Use when: building agent architectures, implementing orchestrator-worker patterns, designing agent communication, debugging agent workflows, or optimizing token usage in multi-agent systems. Covers LangGraph state management, tool routing, agent specialization, and production deployment patterns."
---

# Multi-Agent Orchestration

## Overview

Multi-agent systems outperform single agents on complex tasks by distributing work across specialized agents with independent contexts. Anthropic's research shows orchestrator-worker patterns improve performance by 90%+ on research tasks.

## Architecture Patterns

### 1. Orchestrator-Worker (Recommended)

```
┌─────────────────────────────────────────────────────┐
│                    Orchestrator                      │
│              (Claude Opus / Sonnet)                  │
│  - Analyzes query complexity                         │
│  - Spawns workers with specific tasks                │
│  - Synthesizes results                               │
└─────────────────┬───────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌───────┐   ┌───────┐    ┌───────┐
│Worker │   │Worker │    │Worker │
│(Sonnet)│   │(Sonnet)│    │(Haiku)│
│Research│   │Analyze │    │Format │
└───────┘   └───────┘    └───────┘
```

**Use when:**
- Tasks decompose into parallel subtasks
- Different expertise needed for different parts
- Token cost optimization is important

### 2. Pipeline (Sequential)

```
Input → Agent A → Agent B → Agent C → Output
        (Parse)   (Process)  (Format)
```

**Use when:**
- Each step depends on previous output
- Clear transformation stages
- Quality gates between steps

### 3. Debate/Critique

```
┌─────────┐     ┌─────────┐
│Generator│────▶│ Critic  │
└─────────┘     └────┬────┘
      ▲              │
      └──────────────┘
         (Iterate)
```

**Use when:**
- Output quality is critical
- Self-correction improves results
- Time allows for iteration

## LangGraph Implementation

### Basic Graph Structure

```python
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence
from langchain_anthropic import ChatAnthropic
import operator

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    current_agent: str
    task_queue: list[dict]
    results: list[dict]
    iteration: int

def create_orchestrator():
    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")
    
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("worker_research", research_worker_node)
    graph.add_node("worker_analyze", analysis_worker_node)
    graph.add_node("synthesizer", synthesis_node)
    
    # Add edges
    graph.add_edge(START, "orchestrator")
    graph.add_conditional_edges(
        "orchestrator",
        route_to_workers,
        {
            "research": "worker_research",
            "analyze": "worker_analyze",
            "synthesize": "synthesizer",
            "done": END
        }
    )
    graph.add_edge("worker_research", "orchestrator")
    graph.add_edge("worker_analyze", "orchestrator")
    graph.add_edge("synthesizer", END)
    
    return graph.compile()
```

### Orchestrator Node

```python
def orchestrator_node(state: AgentState) -> dict:
    """Routes work to appropriate workers or synthesizes final result."""
    
    orchestrator_prompt = """You are an orchestrator agent coordinating specialized workers.

Current state:
- Completed tasks: {completed}
- Pending tasks: {pending}
- Results so far: {results}

Analyze the user's request and either:
1. Spawn a worker with a specific task
2. Synthesize final results if all work is complete

Output your decision as JSON:
{{
    "action": "spawn_worker" | "synthesize" | "done",
    "worker_type": "research" | "analyze" | null,
    "task": "specific task description" | null,
    "reasoning": "why this decision"
}}"""

    llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024
    )
    
    response = llm.invoke([
        SystemMessage(content=orchestrator_prompt.format(
            completed=len(state.get("results", [])),
            pending=state.get("task_queue", []),
            results=state.get("results", [])
        )),
        *state["messages"]
    ])
    
    decision = json.loads(response.content)
    
    return {
        "current_agent": decision["action"],
        "task_queue": [decision["task"]] if decision.get("task") else [],
        "messages": [response]
    }
```

### Worker Node Pattern

```python
def create_worker_node(
    name: str,
    system_prompt: str,
    tools: list,
    model: str = "claude-sonnet-4-5-20250929"
):
    """Factory for creating specialized worker nodes."""
    
    def worker_node(state: AgentState) -> dict:
        llm = ChatAnthropic(model=model).bind_tools(tools)
        
        task = state["task_queue"][0] if state["task_queue"] else "No task assigned"
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Your task: {task}")
        ]
        
        # Add relevant context from previous results
        if state.get("results"):
            context = "\n".join([
                f"Previous finding: {r['summary']}" 
                for r in state["results"][-3:]  # Last 3 results
            ])
            messages.append(HumanMessage(content=f"Context:\n{context}"))
        
        response = llm.invoke(messages)
        
        return {
            "results": [{
                "agent": name,
                "task": task,
                "summary": response.content[:500],  # Compress for context
                "full_response": response.content
            }],
            "task_queue": state["task_queue"][1:],  # Pop completed task
            "messages": [response]
        }
    
    return worker_node
```

### Conditional Routing

```python
def route_to_workers(state: AgentState) -> str:
    """Route based on orchestrator's decision."""
    
    current = state.get("current_agent", "")
    
    if current == "spawn_worker":
        # Check what type of worker is needed
        last_message = state["messages"][-1]
        if "research" in last_message.content.lower():
            return "research"
        elif "analyze" in last_message.content.lower():
            return "analyze"
    
    if current == "synthesize":
        return "synthesize"
    
    if not state.get("task_queue") and state.get("results"):
        return "synthesize"
    
    return "done"
```

## Model Tiering Strategy

| Role | Model | Rationale |
|------|-------|-----------|
| Orchestrator | Opus / Sonnet | Complex reasoning, task decomposition |
| Research Worker | Sonnet | Balanced quality/cost for exploration |
| Analysis Worker | Sonnet | Nuanced interpretation |
| Formatting Worker | Haiku | Simple transformation, high volume |
| Critic/Reviewer | Sonnet | Quality assessment |

**Cost Optimization:**
- Use Haiku (40-60% cheaper) for: formatting, extraction, classification
- Use Sonnet for: reasoning, analysis, generation
- Reserve Opus for: orchestration, complex synthesis, ambiguous tasks

## State Management Best Practices

### Compress Context Between Agents

```python
def compress_for_handoff(full_response: str, max_tokens: int = 500) -> str:
    """Compress agent output before passing to next agent."""
    
    # Use a fast model for compression
    compressor = ChatAnthropic(model="claude-haiku-4-5-20251001")
    
    compression_prompt = f"""Compress this analysis into key findings only.
Maximum {max_tokens} tokens. Preserve critical facts and conclusions.

Original:
{full_response}

Compressed:"""
    
    return compressor.invoke([HumanMessage(content=compression_prompt)]).content
```

### Shared Memory Pattern

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# Persist state across runs
memory = SqliteSaver.from_conn_string(":memory:")

graph = create_orchestrator()
app = graph.compile(checkpointer=memory)

# Resume from checkpoint
config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [HumanMessage(content="Continue our analysis")]}, config)
```

## Error Handling

```python
from langgraph.errors import GraphRecursionError

def safe_worker_node(state: AgentState) -> dict:
    """Worker with retry and fallback."""
    
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            result = execute_worker_task(state)
            return result
        except Exception as e:
            if attempt == max_retries - 1:
                return {
                    "results": [{
                        "agent": "error_handler",
                        "task": state["task_queue"][0],
                        "summary": f"Failed after {max_retries} attempts: {str(e)}",
                        "status": "failed"
                    }],
                    "task_queue": state["task_queue"][1:]
                }
            # Exponential backoff
            time.sleep(2 ** attempt)
```

## Debugging Multi-Agent Systems

### Trace Logging

```python
from langchain_core.callbacks import StdOutCallbackHandler

# Enable verbose tracing
app = graph.compile(
    checkpointer=memory,
    debug=True  # Logs state transitions
)

# Or use LangSmith for production
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_PROJECT"] = "multi-agent-debug"
```

### State Inspection

```python
# Visualize graph
from IPython.display import Image
Image(app.get_graph().draw_mermaid_png())

# Inspect state at each step
for step in app.stream({"messages": [HumanMessage(content="Query")]}):
    print(f"Step: {step.keys()}")
    print(f"State: {step}")
```

## Production Checklist

- [ ] Rate limiting per agent to avoid API throttling
- [ ] Token budget per task with early termination
- [ ] Timeout handling for long-running agents
- [ ] Graceful degradation when workers fail
- [ ] Observability: traces, metrics, logs per agent
- [ ] Cost tracking per agent type
- [ ] Caching for repeated sub-queries
- [ ] Load testing multi-agent throughput

## References

See `references/` for:
- `langgraph-patterns.md` — Advanced LangGraph patterns
- `agent-prompts.md` — Tested system prompts for each agent type
- `cost-analysis.md` — Token usage benchmarks
