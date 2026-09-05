import type { PersonRef } from '../types';

export const WEB = 'https://activate.lightci.com';

export const priya: PersonRef = {
  id: 'p-priya', name: 'Priya Nair', email: 'priya.nair@meridianwealth.demo', title: 'Financial Planner',
  avatarUrl: null, teamId: 't-fp', teamName: 'Financial Planning', rung: 2, roles: ['learner'],
};
export const daniel: PersonRef = {
  id: 'p-daniel', name: 'Daniel Okafor', email: 'daniel.okafor@meridianwealth.demo', title: 'Senior Planner · Champion',
  avatarUrl: null, teamId: 't-fp', teamName: 'Financial Planning', rung: 5, roles: ['champion'],
};
export const elena: PersonRef = {
  id: 'p-elena', name: 'Elena Marsh', email: 'elena.marsh@meridianwealth.demo', title: 'COO · Sponsor',
  avatarUrl: null, teamId: null, teamName: null, rung: 1, roles: ['sponsor', 'admin'],
};
export const marcus: PersonRef = {
  id: 'p-marcus', name: 'Marcus Reid', email: 'marcus.reid@meridianwealth.demo', title: 'Associate Planner',
  avatarUrl: null, teamId: 't-fp', teamName: 'Financial Planning', rung: 1, roles: ['learner'],
};
export const sofia: PersonRef = {
  id: 'p-sofia', name: 'Sofia Alvarez', email: 'sofia.alvarez@meridianwealth.demo', title: 'Wealth Advisor · Champion',
  avatarUrl: null, teamId: 't-wa', teamName: 'Wealth Advisors', rung: 4, roles: ['champion'],
};
export const tom: PersonRef = {
  id: 'p-tom', name: 'Tom Becker', email: 'tom.becker@meridianwealth.demo', title: 'Client Service Ops Lead',
  avatarUrl: null, teamId: 't-cso', teamName: 'Client Service Ops', rung: 3, roles: ['champion'],
};
export const megan: PersonRef = {
  id: 'p-megan', name: 'Megan Tully', email: 'megan.tully@meridianwealth.demo', title: 'Planner',
  avatarUrl: null, teamId: 't-fp', teamName: 'Financial Planning', rung: 0, roles: ['learner'],
};

export const viewerLearner = { id: priya.id, name: priya.name, email: priya.email, roles: ['learner'], rung: 2 };
export const viewerChampion = { id: daniel.id, name: daniel.name, email: daniel.email, roles: ['champion'], rung: 5 };
export const viewerSponsor = { id: elena.id, name: elena.name, email: elena.email, roles: ['sponsor', 'admin'], rung: 1 };
