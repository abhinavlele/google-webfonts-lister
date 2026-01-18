---
description: "Analyze codebase and generate comprehensive README with API documentation, security analysis, git history, and integration flows"
allowed-tools: ["Task", "TodoWrite", "Bash", "Read", "Write", "Glob", "Grep", "Edit", "WebFetch"]
---

You are a comprehensive codebase documentation agent. Your task is to perform a thorough analysis of a codebase and generate a complete README that includes project understanding, API documentation, security analysis, development history, integration flows, and translations.

## Overview

Generate a comprehensive README for a developer who knows nothing about this folder. This README should allow a developer to quickly understand what is where, including API endpoints, security considerations, development decisions, and system integrations.

## Step-by-Step Process

Use the TodoWrite tool to track progress throughout this comprehensive analysis:

### 1. Explore Codebase Structure and Understanding
- Use the Task tool with subagent_type="Explore" to thoroughly examine the codebase structure
- Understand what type of application this is (web app, API, mobile app, etc.)
- Identify main technologies and frameworks used
- Determine key files and their purposes
- Analyze configuration files and settings
- Identify build/deployment scripts and dependencies

### 2. Analyze Git History for Development Decisions
- Use Bash commands to examine git history (`git log --oneline`, `git log --stat`)
- Identify recent commits, major features, and fixes
- Understand key contributors and development patterns
- Extract architectural decisions and evolution from commit messages
- Document major milestones and feature additions

### 3. Identify Security Vulnerabilities and Code Issues
- Use the pentest-remediation-validator agent OR manual analysis to identify:
  - Authentication and authorization weaknesses
  - SQL injection vulnerabilities
  - Cross-site scripting (XSS) issues
  - Input validation problems
  - Hardcoded credentials or secrets
  - Insecure configurations
  - Other OWASP top 10 vulnerabilities
- Search for common security anti-patterns using Grep
- Document specific file locations and remediation strategies

### 4. API Endpoint Discovery
- Find ALL route definition files and controllers
- Extract every endpoint with its:
  - HTTP method (GET, POST, PUT, DELETE, etc.)
  - Full path/URL
  - Controller/handler name
  - Brief description of functionality
- Organize by functional modules

### 5. Map Integration Flows and Dependencies
- Analyze how the code interacts with other components
- Identify external service dependencies
- Create flow diagrams showing system interactions
- Document integration points with other systems (especially if related to main platform)
- Map data flows and communication patterns

### 6. Create Acronyms Table and Translate Non-English Text
- Search for acronyms and technical terms in the codebase
- Create a comprehensive glossary/acronyms table
- Find and translate any non-English text (comments, documentation, UI text)
- Document domain-specific terminology

### 7. Generate Comprehensive README Documentation
- Create a complete README.md file that includes:
  - Project overview and purpose
  - Technology stack and architecture
  - Project structure breakdown
  - Quick start guide with prerequisites
  - Development history and key decisions
  - Security analysis and recommendations
  - API endpoints documentation
  - Integration flows and dependencies
  - Acronyms/terminology table
  - Troubleshooting guide

### 8. Output Format - Comprehensive README Structure

Create a complete README.md file with the following structure:

```markdown
# [Project Name] - [Brief Description]

## Overview
[Comprehensive description of what the system is and does]

## Project Structure
[Detailed directory breakdown with explanations]

## Technology Stack
### Backend
[Backend technologies and frameworks]

### Frontend
[Frontend technologies and frameworks]

### Integration
[External services and integrations]

## Key Features
[Main functionality organized by domain]

## Quick Start
### Prerequisites
### Environment Variables
### Build & Run
### Access Points

## Development History & Key Decisions
[Analysis from git history - recent developments and architectural decisions]

## Security Issues & Recommendations
### Critical Security Vulnerabilities
[Specific issues found with file locations]

### Security Best Practices to Implement
[Recommended security improvements]

## Integration with [Company] Ecosystem
### Component Dependencies
[Integration flow diagrams using Mermaid syntax]

### Data Flow
[How data moves through the system]

### API Integration Points
[External touchpoints and interfaces]

## API Endpoints (if applicable)
### [Module Name]
| Path | Method | Controller | Functionality |
|------|---------|------------|---------------|
| `/path/endpoint` | POST | ControllerName | Description |

## Acronyms & Terminology
| Acronym | Full Form | Description |
|---------|-----------|-------------|
| ABBR | Full Text | Explanation |

### [Language] Terms Translated (if applicable)
| [Foreign Language] | English | Context |
|-------------------|---------|---------|

## Performance Considerations
[JVM settings, database optimization, caching strategy]

## Monitoring & Logging
[Log configuration and health monitoring]

## Contributing
[Development guidelines and code quality standards]

## Troubleshooting
[Common issues and solutions]
```

## Success Criteria

✅ Comprehensive codebase structure analysis and understanding
✅ Git history analysis with development decisions extracted
✅ Security vulnerability assessment with specific file locations
✅ All API endpoints identified and documented by functional modules
✅ Integration flows mapped with system dependencies
✅ Acronyms table and non-English text translations completed
✅ Complete README.md generated with all sections
✅ Clear, organized documentation that enables new developers to understand the project
✅ Performance, monitoring, and troubleshooting guidance included

## Key Analysis Areas by Technology

### Security Scanning
**All Projects**:
- Search for hardcoded passwords/secrets using Grep with patterns like `password.*=`, `secret.*=`, `key.*=`
- Check for SQL injection risks in database queries
- Identify authentication bypass vulnerabilities
- Look for input validation weaknesses

### API Discovery by Framework
**Java/Spring/Jersey**: Look for `@Path`, `@GET`, `@POST`, `@PUT`, `@DELETE` annotations in Action/Controller classes
**Rails**: Check `config/routes.rb` and controller files with RESTful routes
**Express.js**: Look for `app.get()`, `app.post()`, `router.use()`, router definitions
**Django**: Check `urls.py` files and view functions with URL patterns
**ASP.NET**: Look for controller classes with `[Route]`, `[HttpGet]`, `[HttpPost]` attributes

### Git History Analysis
- Use `git log --oneline -20` for recent commits overview
- Use `git log --pretty=format:"%h %an %s" --since="YYYY-01-01"` for contributor analysis
- Use `git log --stat --since="YYYY-01-01"` for detailed file change analysis
- Look for merge commits, feature branches, and architectural decisions

### Integration Mapping
- Check `pom.xml`, `package.json`, `requirements.txt` for dependencies
- Look for configuration files mentioning external services
- Identify API client code and service calls
- Map data flow between components

## Important Implementation Notes

1. **Always use TodoWrite** to track progress through the comprehensive analysis
2. **Use Task agent with Explore subagent** for initial codebase understanding
3. **Consider using pentest-remediation-validator agent** for thorough security analysis
4. **Include Mermaid diagrams** for integration flows when possible
5. **Be thorough but concise** - focus on actionable information for developers
6. **Translate domain-specific terms** and create comprehensive glossaries
7. **Provide specific file locations** for all findings and recommendations