/** Server `instructions`: routing only, ≤ 1.5 KB. Behavioural rules live on tool and parameter descriptions. */
export const SERVER_INSTRUCTIONS = [
  "Activate is the learner's ladder, skill library and governance queue for this organisation's Claude programme.",
  'Use my_ladder for "what\'s next", "how am I doing", revisits and hours back.',
  "Use library to browse skills (filters: team, workflow, rung) and skill_detail for one skill's SKILL.md, boundary and usage.",
  'Use submit_artifact to hand in exercise work and submit_skill to grade a skill drafted in the conversation; both write, so call them only after the user says to submit.',
  'Use map_workflow to run the Interviewer over several turns; pass interview_id back each turn.',
  'Champions use team and promotion_queue; sponsors use org. Never show raw ids to the user.',
].join(' ');
