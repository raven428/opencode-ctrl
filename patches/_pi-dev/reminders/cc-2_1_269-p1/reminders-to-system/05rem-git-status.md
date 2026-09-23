<system-reminder>
As you answer the user's questions, you can use the following context:
# gitStatus
This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.

Current branch: {{crs_branch}}

Main branch (you will usually use this for PRs): {{crs_master}}

Git user: {{crs_repo_user}}

Status:
{{crs_repo_status_short}}

Recent commits:
{{crs_repo_recent_commits}}

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>