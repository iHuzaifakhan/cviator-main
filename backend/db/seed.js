// backend/db/seed.js
// ---------------------------------------------------------------
// Idempotent seeding of the faculties + departments tables and
// migration of legacy users.faculty (TEXT) into users.faculty_id /
// users.department_id. Safe to re-run on every boot.
// ---------------------------------------------------------------

const { query } = require('./pool');

// Authoritative list. Adjust here if the institute reorganises.
const FACULTIES = [
  {
    code: 'FCSE',
    name: 'Faculty of Computer Sciences and Engineering',
    departments: [
      { code: 'CS',     name: 'Computer Science' },
      { code: 'CE',     name: 'Computer Engineering' },
      { code: 'SE',     name: 'Software Engineering' },
      { code: 'AI',     name: 'Artificial Intelligence' },
      { code: 'DS',     name: 'Data Science' },
      { code: 'CYBER',  name: 'Cyber Security' },
    ],
  },
  {
    code: 'FEE',
    name: 'Faculty of Electrical Engineering',
    departments: [{ code: 'EE', name: 'Electrical Engineering' }],
  },
  {
    code: 'FME',
    name: 'Faculty of Mechanical Engineering',
    departments: [{ code: 'ME', name: 'Mechanical Engineering' }],
  },
  {
    code: 'FMCE',
    name: 'Faculty of Materials and Chemical Engineering',
    departments: [
      { code: 'MAT',  name: 'Materials Engineering' },
      { code: 'CHEM', name: 'Chemical Engineering' },
    ],
  },
  {
    code: 'FCE',
    name: 'Faculty of Civil Engineering',
    departments: [{ code: 'CIVIL', name: 'Civil Engineering' }],
  },
  {
    code: 'FES',
    name: 'Faculty of Engineering Sciences',
    departments: [{ code: 'ES', name: 'Engineering Sciences' }],
  },
  {
    code: 'FMS',
    name: 'Faculty of Management Sciences',
    departments: [{ code: 'MS', name: 'Management Sciences' }],
  },
];

async function seedFacultiesAndDepartments() {
  for (let i = 0; i < FACULTIES.length; i += 1) {
    const f = FACULTIES[i];
    const { rows } = await query(
      `INSERT INTO faculties (code, name, display_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order
       RETURNING id`,
      [f.code, f.name, i]
    );
    const facultyId = rows[0].id;

    for (let j = 0; j < f.departments.length; j += 1) {
      const d = f.departments[j];
      await query(
        `INSERT INTO departments (faculty_id, code, name, display_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (faculty_id, code) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order`,
        [facultyId, d.code, d.name, j]
      );
    }
  }
}

// Best-effort migration: map legacy users.faculty (TEXT) → faculty_id/department_id.
// Idempotent: only updates rows where the FKs are still NULL.
async function migrateLegacyFacultyText() {
  await query(`
    UPDATE users u
       SET department_id = d.id,
           faculty_id    = d.faculty_id
      FROM departments d
     WHERE u.department_id IS NULL
       AND u.faculty IS NOT NULL
       AND LOWER(TRIM(u.faculty)) = LOWER(d.name)
  `);
}

async function runSeed() {
  await seedFacultiesAndDepartments();
  await migrateLegacyFacultyText();
}

module.exports = { runSeed, FACULTIES };
