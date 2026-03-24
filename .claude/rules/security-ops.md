---
paths:
  - "**/terraform/**"
  - "**/infra-**"
  - "**/security-**"
  - "**/*.tf"
---

# Security-Sensitive Operations

Operations requiring extra review (delegate to `security-engineer`):

| Operation Type | Examples | Required Review |
|----------------|----------|-----------------|
| AWS/Cloud | `aws ec2`, `aws s3`, `aws iam` | security-engineer |
| Terraform | Any `.tf` changes | security-engineer |
| Auth/Secrets | Authentication, API keys, encryption | security-engineer |
| Deletions | `rm -rf`, recursive deletes | Explicit user confirmation |
| Process Control | `pkill`, `kill`, signal handling | User confirmation |
| Permission Changes | `chmod`, `chown` | Security review |
