// The SGA positions, from the "2026-27 ACT SGA positions description" sheet.
// These are roles, not people: who holds each one lives in the database and
// changes every year from the People page.

export type RoleSeed = { id: string; title: string; duties: string; seats: number };

export const ROLES: RoleSeed[] = [
  {
    id: "president", title: "President", seats: 1,
    duties: "Calendar of the academic year. Meeting agenda. Monitoring and coordination of meetings. Coordinates weekly meetings with the Dean.",
  },
  {
    id: "vp-academics", title: "VP for Academics", seats: 1,
    duties: "Member of the Academic Standards & Performance Committee (participates upon invitation). Replaces the President in their absence, when requested by the President.",
  },
  {
    id: "vp-student-affairs", title: "VP for Student Affairs", seats: 1,
    duties: "Liaison with IPO (participates upon invitation and suggests common actions). Elections: posts announcements, sets dates, forms the Election Committees. Replaces the President in their absence, when requested by the President.",
  },
  {
    id: "secretary", title: "Secretary", seats: 1,
    duties: "Keeps the meeting minutes and brings them to the next meeting for approval. Prepares, with the President, the mid-year and final reports and presents them at the last meeting of the year.",
  },
  {
    id: "treasurer", title: "Treasurer", seats: 1,
    duties: "Keeps the finances and prepares the mid-year and end-of-year financial reports, presented at the last meeting of the semester. Oversees apparel selling, together with the Freshman Class Representative.",
  },
  {
    id: "senior-rep", title: "Senior Class Representative", seats: 1,
    duties: "Works with the Graduation Coordinator on graduation. Assists the Sophomore rep with charity events and projects (clothes drives, bottle caps). Liaison with the ACT Alumni Association.",
  },
  {
    id: "junior-rep", title: "Junior Class Representative", seats: 1,
    duties: "Works with Business Liaison, Career Services & Alumni Relations Office.",
  },
  {
    id: "sophomore-rep", title: "Sophomore Class Representative", seats: 1,
    duties: "Suggests and coordinates charity events and projects (clothes drives, bottle caps).",
  },
  {
    id: "freshman-rep", title: "Freshman Class Representative", seats: 1,
    duties: "Assistant to the Treasurer and liaison with the library.",
  },
  { id: "study-abroad-rep", title: "Study Abroad Representative", seats: 1, duties: "Represents study-abroad students." },
  { id: "nuin-rep", title: "NUin Representative", seats: 2, duties: "Represents NUin students." },
];
