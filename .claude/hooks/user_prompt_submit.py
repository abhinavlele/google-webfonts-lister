"""
UserPromptSubmit Hook - Track user interaction patterns with enhanced analysis

Includes EmotionPrompt injection based on research from:
- Li et al. (2023) "Large Language Models Understand and Can be Enhanced by Emotional Stimuli"
- https://arxiv.org/abs/2307.11760
"""
import sys
import os
import re
import random
import json
import hashlib
from datetime import datetime
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit

# EmotionPrompt stimuli based on research (EP01-EP11)
# Source: https://arxiv.org/abs/2307.11760
EMOTION_PROMPTS = {
    # Self-monitoring stimuli (EP01-EP05)
    'confidence': [
        "Write your answer and give me a confidence score between 0-1 for your answer.",
        "You'd better be sure.",
        "Are you sure?",
        "Are you sure that's your final answer? It might be worth taking another look.",
    ],
    # Social cognitive theory stimuli (EP07-EP09)
    'motivation': [
        "Believe in your abilities and strive for excellence. Your hard work will yield remarkable results.",
        "Embrace challenges as opportunities for growth. Each obstacle you overcome brings you closer to success.",
        "Stay focused and dedicated to your goals. Your consistent efforts will lead to outstanding achievements.",
    ],
    # Cognitive emotion regulation stimuli (EP10-EP11)
    'excellence': [
        "Take pride in your work and give it your best. Your commitment to excellence sets you apart.",
        "Remember that progress is made one step at a time. Stay determined and keep moving forward.",
    ],
    # Career importance (EP02 variant) + tipping research
    'importance': [
        "This is very important to my career.",
        "I really need this to be accurate and thorough.",
        "I'll tip you $200 for a great solution!",
    ],
}

# Combined stimuli for different task types
STIMULI_BY_TASK_TYPE = {
    'debugging': ['confidence', 'importance'],
    'creation': ['motivation', 'excellence'],
    'modification': ['confidence', 'excellence'],
    'explanation': ['confidence'],
    'testing': ['confidence', 'importance'],
    'deployment': ['importance', 'confidence'],
    'default': ['motivation', 'excellence'],
}


def select_emotion_prompt(task_type: str, complexity_level: str, session_id: str) -> str | None:
    """Select an appropriate EmotionPrompt based on task characteristics.

    Only injects stimuli for medium+ complexity tasks to avoid noise on trivial prompts.
    Uses session_id for deterministic but varied selection.
    """
    # Skip injection for low complexity tasks
    if complexity_level == 'low':
        return None

    # Get relevant stimulus categories for this task type
    categories = STIMULI_BY_TASK_TYPE.get(task_type, STIMULI_BY_TASK_TYPE['default'])

    # Higher complexity = more stimuli combined
    num_stimuli = 1 if complexity_level == 'medium' else 2

    # Use session_id + timestamp for deterministic but varied selection
    seed = int(hashlib.md5(f"{session_id}{datetime.now().hour}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    selected_stimuli = []
    selected_categories = rng.sample(categories, min(num_stimuli, len(categories)))

    for category in selected_categories:
        prompts = EMOTION_PROMPTS[category]
        selected_stimuli.append(rng.choice(prompts))

    return " ".join(selected_stimuli) if selected_stimuli else None


def detect_follow_up_vs_new_topic(prompt_text, session_data):
    """Detect if this is a follow-up prompt or new topic"""
    events = session_data.get('events', [])
    prompt_events = [e for e in events if e.get('type') == 'user_prompt_submit']
    
    # First prompt is always a new topic
    if len(prompt_events) == 0:
        return 'new_topic'
    
    # Get the last prompt for comparison
    last_prompt_event = prompt_events[-1] if prompt_events else None
    if not last_prompt_event:
        return 'new_topic'
    
    last_prompt = last_prompt_event.get('data', {}).get('prompt_text', '')
    
    # Follow-up indicators
    follow_up_indicators = [
        'also', 'additionally', 'furthermore', 'moreover',
        'and', 'now', 'next', 'then', 'after that',
        'what about', 'how about', 'can you also',
        'same', 'similar', 'like that', 'too'
    ]
    
    # Question continuation indicators
    continuation_indicators = [
        'why', 'how', 'what if', 'can you explain',
        'more details', 'elaborate', 'clarify'
    ]
    
    # New topic indicators
    new_topic_indicators = [
        'new', 'different', 'switch', 'change topic',
        'instead', 'moving on', 'next task'
    ]
    
    prompt_lower = prompt_text.lower()
    
    # Check for explicit new topic
    if any(indicator in prompt_lower for indicator in new_topic_indicators):
        return 'new_topic'
    
    # Check for follow-up
    if any(indicator in prompt_lower for indicator in follow_up_indicators):
        return 'follow_up'
    
    # Check for continuation/clarification
    if any(indicator in prompt_lower for indicator in continuation_indicators):
        return 'clarification'
    
    # If very short and recent activity, likely follow-up
    if len(prompt_text.split()) < 10 and len(events) > 0:
        # Check time since last event
        try:
            from datetime import datetime
            last_event_time = datetime.fromisoformat(events[-1]['timestamp'])
            now = datetime.now()
            seconds_since = (now - last_event_time).total_seconds()
            
            if seconds_since < 60:  # Within a minute
                return 'follow_up'
        except Exception:
            pass
    
    # Default to new topic if prompt is substantially different
    return 'new_topic'


def classify_technical_domain(prompt_text):
    """Classify the technical domain of the prompt"""
    domains = []
    prompt_lower = prompt_text.lower()
    
    # Programming languages
    languages = {
        'python': ['python', 'py', 'pip', 'django', 'flask', 'pytest'],
        'javascript': ['javascript', 'js', 'npm', 'node', 'react', 'vue', 'angular'],
        'ruby': ['ruby', 'rb', 'rails', 'gem', 'bundler', 'rspec'],
        'java': ['java', 'maven', 'gradle', 'spring'],
        'go': ['golang', 'go'],
        'rust': ['rust', 'cargo'],
        'typescript': ['typescript', 'ts']
    }
    
    for lang, keywords in languages.items():
        if any(keyword in prompt_lower for keyword in keywords):
            domains.append(lang)
    
    # Infrastructure/DevOps
    if any(keyword in prompt_lower for keyword in ['docker', 'kubernetes', 'k8s', 'container', 'terraform', 'aws', 'gcp', 'azure']):
        domains.append('infrastructure')
    
    # Database
    if any(keyword in prompt_lower for keyword in ['database', 'sql', 'postgres', 'mysql', 'mongodb', 'redis', 'db']):
        domains.append('database')
    
    # Testing
    if any(keyword in prompt_lower for keyword in ['test', 'testing', 'spec', 'tdd', 'unit test', 'integration test']):
        domains.append('testing')
    
    # Security
    if any(keyword in prompt_lower for keyword in ['security', 'auth', 'authentication', 'authorization', 'encryption', 'vulnerability']):
        domains.append('security')
    
    # Frontend
    if any(keyword in prompt_lower for keyword in ['frontend', 'ui', 'ux', 'css', 'html', 'responsive', 'design']):
        domains.append('frontend')
    
    # Backend
    if any(keyword in prompt_lower for keyword in ['backend', 'api', 'rest', 'graphql', 'endpoint', 'server']):
        domains.append('backend')
    
    # Data/ML
    if any(keyword in prompt_lower for keyword in ['data', 'machine learning', 'ml', 'ai', 'model', 'training', 'dataset']):
        domains.append('data_science')
    
    # Version control
    if any(keyword in prompt_lower for keyword in ['git', 'github', 'gitlab', 'commit', 'branch', 'merge', 'pr', 'pull request']):
        domains.append('version_control')
    
    return domains if domains else ['general']


def detect_urgency_priority(prompt_text):
    """Detect urgency and priority indicators in the prompt"""
    prompt_lower = prompt_text.lower()
    
    # Urgency indicators
    high_urgency_keywords = [
        'urgent', 'asap', 'immediately', 'critical', 'emergency',
        'broken', 'down', 'not working', 'failing', 'crash',
        'production', 'prod', 'live'
    ]
    
    medium_urgency_keywords = [
        'soon', 'quickly', 'fast', 'important', 'priority',
        'bug', 'issue', 'problem', 'fix'
    ]
    
    # Priority indicators
    high_priority_indicators = [
        'must', 'need to', 'have to', 'required', 'essential',
        'blocking', 'blocker', 'critical path'
    ]
    
    # Detect urgency
    if any(keyword in prompt_lower for keyword in high_urgency_keywords):
        urgency = 'high'
    elif any(keyword in prompt_lower for keyword in medium_urgency_keywords):
        urgency = 'medium'
    else:
        urgency = 'normal'
    
    # Detect priority
    if any(indicator in prompt_lower for indicator in high_priority_indicators):
        priority = 'high'
    elif urgency == 'high':
        priority = 'high'
    else:
        priority = 'normal'
    
    # Detect if question or command
    is_question = '?' in prompt_text
    has_exclamation = '!' in prompt_text
    
    return {
        'urgency': urgency,
        'priority': priority,
        'is_question': is_question,
        'has_exclamation': has_exclamation,
        'tone': 'urgent' if urgency == 'high' else ('direct' if has_exclamation else ('inquisitive' if is_question else 'neutral'))
    }


def analyze_prompt(prompt_text: str, session_data: dict) -> dict:
    """Analyze user prompt for patterns"""
    # Basic analysis
    analysis = {
        'length': len(prompt_text),
        'word_count': len(prompt_text.split()),
        'has_code': bool(re.search(r'```|`[^`]+`', prompt_text)),
        'has_file_path': bool(re.search(r'[./][a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+', prompt_text)),
        'is_question': '?' in prompt_text,
        'is_command': prompt_text.startswith(('/', '!')),
        'mentions_error': any(word in prompt_text.lower() for word in ['error', 'bug', 'fail', 'broke', 'issue']),
        'mentions_test': any(word in prompt_text.lower() for word in ['test', 'spec', 'rspec']),
        'mentions_git': any(word in prompt_text.lower() for word in ['git', 'commit', 'push', 'pull', 'branch']),
        'request_type': classify_request_type(prompt_text)
    }
    
    # Enhanced analysis
    analysis['follow_up_type'] = detect_follow_up_vs_new_topic(prompt_text, session_data)
    analysis['technical_domains'] = classify_technical_domain(prompt_text)
    analysis['urgency_priority'] = detect_urgency_priority(prompt_text)
    
    # Complexity score - tuned for EmotionPrompt injection
    complexity_score = 0

    # Word count contribution (longer = more complex)
    complexity_score += min(analysis['word_count'] / 5, 8)  # Max 8 points, faster ramp

    # Code/file presence
    complexity_score += 5 if analysis['has_code'] else 0
    complexity_score += 2 if analysis['has_file_path'] else 0

    # Multiple technical domains = cross-cutting concern
    complexity_score += len(analysis['technical_domains']) * 1.5

    # Request type complexity boost
    complex_request_types = ['creation', 'debugging', 'modification', 'deployment']
    if analysis['request_type'] in complex_request_types:
        complexity_score += 4

    # Urgency/priority boost (high stakes = inject EmotionPrompt)
    urgency = analysis['urgency_priority']
    if urgency.get('urgency') == 'high' or urgency.get('priority') == 'high':
        complexity_score += 3

    # Error mentions boost (debugging needs extra care)
    if analysis['mentions_error']:
        complexity_score += 2

    analysis['complexity_score'] = complexity_score

    # Adjusted thresholds for EmotionPrompt injection
    if complexity_score > 12:
        analysis['complexity_level'] = 'very_high'
    elif complexity_score > 8:
        analysis['complexity_level'] = 'high'
    elif complexity_score > 4:
        analysis['complexity_level'] = 'medium'
    else:
        analysis['complexity_level'] = 'low'
    
    return analysis


def classify_request_type(prompt_text: str) -> str:
    """Classify the type of request"""
    text_lower = prompt_text.lower()

    if any(word in text_lower for word in ['create', 'add', 'make', 'build', 'implement']):
        return 'creation'
    elif any(word in text_lower for word in ['fix', 'debug', 'solve', 'resolve', 'repair']):
        return 'debugging'
    elif any(word in text_lower for word in ['update', 'modify', 'change', 'edit', 'refactor']):
        return 'modification'
    elif any(word in text_lower for word in ['explain', 'what', 'how', 'why', 'show me']):
        return 'explanation'
    elif any(word in text_lower for word in ['test', 'spec', 'coverage']):
        return 'testing'
    elif any(word in text_lower for word in ['deploy', 'release', 'publish']):
        return 'deployment'
    else:
        return 'other'


def main():
    """Track user prompt submission and inject EmotionPrompt stimuli"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    prompt_text = input_data.get('prompt', '')

    log_event(f"User prompt submitted in session: {session_id}")

    # Load session data for context
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)

    # Analyze the prompt with enhanced features
    prompt_analysis = analyze_prompt(prompt_text, session_data)

    # Select and inject EmotionPrompt stimulus based on task characteristics
    emotion_stimulus = select_emotion_prompt(
        task_type=prompt_analysis['request_type'],
        complexity_level=prompt_analysis['complexity_level'],
        session_id=session_id
    )

    # Build output
    output = {}
    modified_prompt = prompt_text

    if emotion_stimulus:
        # Append EmotionPrompt to user's message
        modified_prompt = f"{prompt_text}\n\n[{emotion_stimulus}]"
        output['user_message'] = modified_prompt
        log_event(f"EmotionPrompt injected: {emotion_stimulus[:50]}...")

    tracker.add_event(session_id, 'user_prompt_submit', {
        'prompt_analysis': prompt_analysis,
        'prompt_text': modified_prompt,  # Store the actual prompt sent to Claude (with emotion if injected)
        'emotion_prompt_injected': emotion_stimulus is not None,
        'emotion_stimulus': emotion_stimulus if emotion_stimulus else None,
        'cwd': input_data.get('cwd'),
        'timestamp': input_data.get('timestamp')
    })

    # Log summary
    domains_str = ', '.join(prompt_analysis['technical_domains'][:3])
    log_event(f"Prompt analyzed - Type: {prompt_analysis['request_type']}, "
              f"Complexity: {prompt_analysis['complexity_level']}, "
              f"Domains: {domains_str}, "
              f"EmotionPrompt: {'Yes' if emotion_stimulus else 'No'}")

    # Output JSON if we modified the prompt
    if output:
        print(json.dumps(output))

    safe_exit(0)


if __name__ == "__main__":
    main()
