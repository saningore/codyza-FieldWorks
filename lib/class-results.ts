export type ClassAssignment = { id: string; category_id: string | null; points: string; due_at: string | null };
export type ClassSubmission = { id: string; assignment_id: string; user_id: string; attempt: number };
export type ClassGrade = { submission_id: string; score: string; excused: boolean; posted_at: string | null };

export function rowsForStudent(
  userId: string,
  assignments: ClassAssignment[],
  submissions: ClassSubmission[],
  grades: ClassGrade[],
  missingAsZero: boolean,
) {
  return assignments.map((assignment) => {
    const latest = submissions
      .filter((submission) => submission.assignment_id === assignment.id && submission.user_id === userId)
      .sort((a, b) => b.attempt - a.attempt)[0];
    const grade = latest ? grades.find((item) => item.submission_id === latest.id) : undefined;
    const past = Boolean(assignment.due_at && Date.parse(assignment.due_at) < Date.now());
    return {
      categoryId: assignment.category_id ?? "none",
      points: Number(assignment.points),
      score: grade ? Number(grade.score) : null,
      excused: Boolean(grade?.excused),
      missing: !latest && past,
      posted: Boolean(grade?.posted_at) || (!latest && past && missingAsZero),
    };
  });
}
