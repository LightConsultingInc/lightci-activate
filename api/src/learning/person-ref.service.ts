import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Placement } from './entities/placement.entity';
import type { PersonRef } from './learning.types';

/**
 * Builds the shared `PersonRef` summary (contract preamble). Rung is the latest Placement;
 * teamName is resolved from Team. Exported from LearningModule so every module renders the
 * same person summary.
 */
@Injectable()
export class PersonRefService {
  constructor(
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Placement)
    private readonly placements: Repository<Placement>,
  ) {}

  async currentRung(personId: string): Promise<number> {
    const placement = await this.placements.findOne({
      where: { personId },
      order: { placedAt: 'DESC' },
    });
    return placement?.rung ?? 0;
  }

  async ref(person: Person): Promise<PersonRef> {
    const [refs] = await this.refs([person]);
    return refs;
  }

  async refById(personId: string): Promise<PersonRef | null> {
    const person = await this.people.findOne({ where: { id: personId } });
    return person ? this.ref(person) : null;
  }

  async refs(persons: Person[]): Promise<PersonRef[]> {
    if (persons.length === 0) return [];
    const teamIds = [
      ...new Set(
        persons.map((p) => p.teamId).filter((t): t is string => Boolean(t)),
      ),
    ];
    const teams = teamIds.length
      ? await this.teams.find({ where: { id: In(teamIds) } })
      : [];
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const placements = await this.placements.find({
      where: { personId: In(persons.map((p) => p.id)) },
      order: { placedAt: 'DESC' },
    });
    const rung = new Map<string, number>();
    for (const p of placements)
      if (!rung.has(p.personId)) rung.set(p.personId, p.rung);
    return persons.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      avatarUrl: p.avatarUrl,
      teamId: p.teamId,
      teamName: p.teamId ? (teamName.get(p.teamId) ?? null) : null,
      rung: rung.get(p.id) ?? 0,
      roles: p.roles,
    }));
  }
}
