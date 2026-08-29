/*
 * Seeds a school with a usable starting shape: Kindergarten to Class 10, a
 * staff room, and students spread across sections with guardians.
 *
 * Safe to re-run: everything is matched on a natural key and skipped if present.
 *   node scripts/seed.cjs            fixes grades only
 *   node scripts/seed.cjs --people      also adds staff, sections and students
 *   node scripts/seed.cjs --subjects    also adds subjects and per-grade offerings
 *   node scripts/seed.cjs --teaching    also assigns teachers to each subject
 *                                       add --reassign to redistribute existing ones
 *   node scripts/seed.cjs --attendance  also fills roll calls up to today
 */
require("dotenv").config();
const { Client } = require("pg");

const WITH_PEOPLE = process.argv.includes("--people");

const GRADES = [
  ["Kindergarten", 0],
  ["Class 1", 1],
  ["Class 2", 2],
  ["Class 3", 3],
  ["Class 4", 4],
  ["Class 5", 5],
  ["Class 6", 6],
  ["Class 7", 7],
  ["Class 8", 8],
  ["Class 9", 9],
  ["Class 10", 10],
];

// Common misspellings already in the database, mapped to their correct form.
const RENAMES = [
  ["Classs 1", "Class 1"],
  ["Kindergarden", "Kindergarten"],
  ["Kindergarton", "Kindergarten"],
  ["Senior Kindergarden", "Senior Kindergarten"],
  ["Junior Kindergarden", "Junior Kindergarten"],
];

const STAFF = [
  ["Sita", null, "Sharma", "सीता शर्मा", "9801000001", "Principal"],
  ["Ramesh", "Bahadur", "Thapa", "रमेश बहादुर थापा", "9801000002", "Vice Principal"],
  ["Gita", null, "Adhikari", "गीता अधिकारी", "9801000003", "Teacher"],
  ["Bikash", null, "Rai", "विकास राई", "9801000004", "Teacher"],
  ["Sunita", "Kumari", "Magar", "सुनिता कुमारी मगर", "9801000005", "Teacher"],
  ["Hari", null, "Gurung", "हरि गुरुङ", "9801000006", "Teacher"],
  ["Anjali", null, "Shrestha", "अञ्जली श्रेष्ठ", "9801000007", "Teacher"],
  ["Deepak", null, "Karki", "दीपक कार्की", "9801000008", "Accountant"],
];

const FIRST_M = ["Anish", "Bibek", "Sujan", "Nabin", "Prakash", "Rohan", "Sagar", "Kiran", "Manish", "Ujjwal"];
const FIRST_F = ["Asha", "Bina", "Puja", "Sarita", "Nisha", "Rekha", "Sabina", "Muna", "Anita", "Sunita"];
const MIDDLES = [null, null, null, "Kumar", "Kumari", "Bahadur"];
const SURNAMES = ["Thapa", "Rai", "Shrestha", "Gurung", "Magar", "Karki", "Adhikari", "Poudel", "Lama", "Tamang"];
const PLACES = ["Lalitpur-3", "Kathmandu-11", "Bhaktapur-6", "Pokhara-8", "Butwal-4", "Dharan-9"];

// Deterministic, so re-running produces the same people rather than duplicates.
function rng(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  try {
    await c.query("BEGIN");

    for (const [wrong, right] of RENAMES) {
      const r = await c.query('UPDATE "Grade" SET name = $1 WHERE name = $2', [right, wrong]);
      if (r.rowCount) console.log(`renamed "${wrong}" -> "${right}"`);
    }

    // Park every grade out of the way so the unique order index cannot trip.
    await c.query('UPDATE "Grade" SET "order" = -1000 - id');

    let added = 0;
    for (const [name, order] of GRADES) {
      const existing = await c.query('SELECT id FROM "Grade" WHERE name = $1', [name]);
      if (existing.rowCount) {
        await c.query('UPDATE "Grade" SET "order" = $1 WHERE name = $2', [order, name]);
      } else {
        await c.query('INSERT INTO "Grade" (name, "order") VALUES ($1, $2)', [name, order]);
        added++;
      }
    }

    // Anything not in the standard list keeps a stable slot after the known ones.
    const strays = await c.query(
      'SELECT id, name FROM "Grade" WHERE "order" < 0 ORDER BY name',
    );
    let next = GRADES.length;
    for (const row of strays.rows) {
      await c.query('UPDATE "Grade" SET "order" = $1 WHERE id = $2', [next++, row.id]);
      console.log(`kept non-standard grade "${row.name}" at order ${next - 1}`);
    }

    console.log(`grades: ${added} added, ${GRADES.length - added} already present`);

    if (WITH_PEOPLE) {
      await seedPeople(c);
    }
    if (process.argv.includes("--subjects")) {
      await seedSubjects(c);
    }
    if (process.argv.includes("--teaching")) {
      await seedTeaching(c);
    }
    if (process.argv.includes("--attendance")) {
      await seedAttendance(c);
    }

    await c.query("COMMIT");
    console.log("done");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

async function seedPeople(c) {
  const year = await c.query(
    'SELECT id, "nameBS", "startsOn" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping staff and students");
    return;
  }
  const yearId = year.rows[0].id;
  const admittedOn = year.rows[0].startsOn;

  // --- staff ---
  let staffAdded = 0;
  const staffIds = [];
  for (const [first, middle, last, np, phone, designation] of STAFF) {
    const full = [first, middle, last].filter(Boolean).join(" ");
    // Match on name as well as phone: the same person entered by hand with a
    // different number should be recognised, not doubled.
    const found = await c.query(
      'SELECT id, "fullName" FROM "Staff" WHERE phone = $1 OR lower("fullName") = lower($2) LIMIT 1',
      [phone, full],
    );
    if (found.rowCount) {
      staffIds.push(found.rows[0].id);
      console.log(`  staff "${found.rows[0].fullName}" already on record — reused`);
      continue;
    }
    const r = await c.query(
      `INSERT INTO "Staff" ("firstName","middleName","lastName","fullName","fullNameNp",phone,designation,"joinedOn","isActive")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
      [first, middle, last, full, np, phone, designation, admittedOn],
    );
    staffIds.push(r.rows[0].id);
    staffAdded++;
  }
  console.log(`staff: ${staffAdded} added, ${STAFF.length - staffAdded} already present`);

  // --- sections: one 'A' per grade for the current year ---
  const grades = await c.query('SELECT id, name FROM "Grade" ORDER BY "order"');
  const sectionIds = [];
  for (const g of grades.rows) {
    const found = await c.query(
      'SELECT id FROM "Section" WHERE "gradeId" = $1 AND "academicYearId" = $2 AND name = $3',
      [g.id, yearId, "A"],
    );
    if (found.rowCount) {
      sectionIds.push({ id: found.rows[0].id, grade: g.name });
      continue;
    }
    const r = await c.query(
      'INSERT INTO "Section" (name,"gradeId","academicYearId") VALUES ($1,$2,$3) RETURNING id',
      ["A", g.id, yearId],
    );
    sectionIds.push({ id: r.rows[0].id, grade: g.name });
  }
  console.log(`sections: ${sectionIds.length} present for the current year`);

  // Give each section a class teacher, cycling through the teaching staff.
  const teachers = staffIds.slice(2);
  for (const [i, section] of sectionIds.entries()) {
    if (!teachers.length) break;
    await c.query('UPDATE "Section" SET "classTeacherId" = $1 WHERE id = $2 AND "classTeacherId" IS NULL', [
      teachers[i % teachers.length],
      section.id,
    ]);
  }

  // --- students ---
  const rand = rng(20820001);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const highest = await c.query(
    `SELECT coalesce(max(("admissionNo")::bigint), 1000) AS top
     FROM "Student" WHERE "admissionNo" ~ '^[0-9]+$'`,
  );
  let admission = Number(highest.rows[0].top) + 1;
  let studentCount = 0;

  for (const section of sectionIds) {
    // Fill only the sections that are empty, so a section the school has already
    // populated by hand is never topped up with invented pupils.
    const existing = await c.query(
      'SELECT count(*)::int AS n, coalesce(max("rollNo"), 0) AS top FROM "Enrollment" WHERE "sectionId" = $1 AND "academicYearId" = $2',
      [section.id, yearId],
    );
    if (existing.rows[0].n > 0) {
      console.log(`  ${section.grade} A: ${existing.rows[0].n} already enrolled — left alone`);
      continue;
    }

    const size = 8 + Math.floor(rand() * 5);
    for (let roll = 1; roll <= size; roll++) {
      const female = rand() < 0.5;
      const first = pick(female ? FIRST_F : FIRST_M);
      const middle = pick(MIDDLES);
      const last = pick(SURNAMES);
      const full = [first, middle, last].filter(Boolean).join(" ");

      // Ages roughly track the grade, so dates of birth look believable.
      const born = new Date(admittedOn);
      born.setFullYear(born.getFullYear() - (4 + sectionIds.indexOf(section)));
      born.setMonth(Math.floor(rand() * 12));
      born.setDate(1 + Math.floor(rand() * 27));

      const s = await c.query(
        `INSERT INTO "Student" ("admissionNo","firstName","middleName","lastName","fullName",dob,gender,address,"admittedOn",status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE') RETURNING id`,
        [
          String(admission++),
          first,
          middle,
          last,
          full,
          born.toISOString().slice(0, 10),
          female ? "FEMALE" : "MALE",
          pick(PLACES),
          admittedOn,
        ],
      );
      const studentId = s.rows[0].id;

      await c.query(
        `INSERT INTO "Guardian" ("studentId",relation,"fullName",phone,"isPrimary")
         VALUES ($1,$2,$3,$4,true)`,
        [
          studentId,
          rand() < 0.7 ? "FATHER" : "MOTHER",
          `${pick(FIRST_M)} ${last}`,
          `98${String(10000000 + Math.floor(rand() * 89999999)).slice(0, 8)}`,
        ],
      );

      await c.query(
        `INSERT INTO "Enrollment" ("studentId","sectionId","academicYearId","rollNo","enrolledOn")
         VALUES ($1,$2,$3,$4,$5)`,
        [studentId, section.id, yearId, roll, admittedOn],
      );
      studentCount++;
    }
  }
  console.log(`students: ${studentCount} added across ${sectionIds.length} sections`);
}

// Canonical subject list. `aliases` lets an existing subject the school already
// typed in be reused instead of quietly creating a near-duplicate beside it.
const SUBJECTS = {
  NEP:     { name: "Nepali",                        practical: false, aliases: ["nepali"] },
  ENG:     { name: "English",                       practical: false, aliases: ["english"] },
  MATH:    { name: "Mathematics",                   practical: false,
             aliases: ["math", "maths", "mathematics", "compulsory math", "compulsory maths"] },
  SCI:     { name: "Science",                       practical: true,  aliases: ["science"] },
  SCITECH: { name: "Science and Technology",        practical: true,  aliases: ["science and technology", "sci tech"] },
  SOC:     { name: "Social Studies",                practical: false, aliases: ["social", "social studies"] },
  SURR:    { name: "Our Surroundings",              practical: false, aliases: ["our surroundings", "serofero"] },
  HPE:     { name: "Health and Physical Education", practical: true,  aliases: ["health", "physical education", "hpe"] },
  COMP:    { name: "Computer Science",              practical: true,  aliases: ["computer", "computer science", "ict"] },
  MORAL:   { name: "Moral Education",               practical: false, aliases: ["moral", "moral education"] },
  OBTE:    { name: "Occupation, Business and Technology", practical: true, aliases: ["obte", "occupation business and technology"] },
  ART:     { name: "Art and Craft",                 practical: true,  aliases: ["art", "drawing", "art and craft"] },
  GK:      { name: "General Knowledge",             practical: false, aliases: ["general knowledge", "gk"] },
  OPTMATH: { name: "Optional Mathematics",          practical: false, aliases: ["optional math", "optional mathematics", "opt math"] },
};

// Which subjects each grade is taught. Pre-primary is deliberately short.
const CURRICULUM = {
  "Kindergarten":        ["ENG", "NEP", "MATH", "GK", "ART"],
  "Junior Kindergarten": ["ENG", "NEP", "MATH", "GK", "ART"],
  "Senior Kindergarten": ["ENG", "NEP", "MATH", "GK", "ART"],
  "Class 1":  ["NEP", "ENG", "MATH", "SURR", "HPE", "MORAL", "ART"],
  "Class 2":  ["NEP", "ENG", "MATH", "SURR", "HPE", "MORAL", "ART"],
  "Class 3":  ["NEP", "ENG", "MATH", "SURR", "HPE", "MORAL", "ART", "COMP"],
  "Class 4":  ["NEP", "ENG", "MATH", "SCI", "SOC", "HPE", "COMP", "MORAL"],
  "Class 5":  ["NEP", "ENG", "MATH", "SCI", "SOC", "HPE", "COMP", "MORAL"],
  "Class 6":  ["NEP", "ENG", "MATH", "SCI", "SOC", "HPE", "COMP", "OBTE", "MORAL"],
  "Class 7":  ["NEP", "ENG", "MATH", "SCI", "SOC", "HPE", "COMP", "OBTE", "MORAL"],
  "Class 8":  ["NEP", "ENG", "MATH", "SCI", "SOC", "HPE", "COMP", "OBTE", "MORAL"],
  "Class 9":  ["NEP", "ENG", "MATH", "SCITECH", "SOC", "HPE", "COMP", "OPTMATH"],
  "Class 10": ["NEP", "ENG", "MATH", "SCITECH", "SOC", "HPE", "COMP", "OPTMATH"],
};

const PRE_PRIMARY = new Set([
  "Kindergarten",
  "Junior Kindergarten",
  "Senior Kindergarten",
]);

/// Pre-primary is marked out of 50; everything else follows the NEB-typical
/// 75 + 25 split when there is a practical, and 100 when there is not.
function markScheme(gradeName, practical) {
  if (PRE_PRIMARY.has(gradeName)) {
    return { fullT: 50, passT: 20, fullP: null, passP: null, practical: false };
  }
  return practical
    ? { fullT: 75, passT: 27, fullP: 25, passP: 10, practical: true }
    : { fullT: 100, passT: 40, fullP: null, passP: null, practical: false };
}

async function seedSubjects(c) {
  const year = await c.query(
    'SELECT id, "nameBS" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping subjects");
    return;
  }
  const yearId = year.rows[0].id;

  // Resolve every canonical subject to a row, reusing anything already there.
  const existing = await c.query('SELECT id, name, code FROM "Subject"');
  const byCode = new Map(existing.rows.map((r) => [r.code.toUpperCase(), r]));
  const byName = new Map(existing.rows.map((r) => [r.name.trim().toLowerCase(), r]));

  const resolved = {};
  let created = 0;
  let reused = 0;

  for (const [code, def] of Object.entries(SUBJECTS)) {
    let row = byCode.get(code);
    if (!row) {
      for (const alias of def.aliases) {
        const hit = byName.get(alias);
        if (hit) {
          row = hit;
          console.log(`  reusing existing "${hit.name}" (${hit.code}) as ${def.name}`);
          break;
        }
      }
    }
    if (row) {
      resolved[code] = row.id;
      reused++;
      continue;
    }
    const r = await c.query(
      'INSERT INTO "Subject" (name, code) VALUES ($1, $2) RETURNING id',
      [def.name, code],
    );
    resolved[code] = r.rows[0].id;
    created++;
  }
  console.log(`subjects: ${created} created, ${reused} reused`);

  const grades = await c.query('SELECT id, name FROM "Grade" ORDER BY "order"');
  let offered = 0;
  let skipped = 0;
  let unknown = 0;

  for (const grade of grades.rows) {
    const codes = CURRICULUM[grade.name];
    if (!codes) {
      console.log(`  no curriculum defined for "${grade.name}" — left empty`);
      unknown++;
      continue;
    }
    for (const code of codes) {
      const subjectId = resolved[code];
      const scheme = markScheme(grade.name, SUBJECTS[code].practical);

      const already = await c.query(
        'SELECT id FROM "SubjectOffering" WHERE "subjectId" = $1 AND "gradeId" = $2 AND "academicYearId" = $3',
        [subjectId, grade.id, yearId],
      );
      if (already.rowCount) {
        skipped++;
        continue;
      }
      await c.query(
        `INSERT INTO "SubjectOffering"
           ("subjectId","gradeId","academicYearId","hasPractical",
            "fullMarksTheory","passMarksTheory","fullMarksPractical","passMarksPractical")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          subjectId, grade.id, yearId, scheme.practical,
          scheme.fullT, scheme.passT, scheme.fullP, scheme.passP,
        ],
      );
      offered++;
    }
  }
  console.log(
    `offerings: ${offered} added, ${skipped} already present` +
      (unknown ? `, ${unknown} grade(s) without a curriculum` : ""),
  );
}

/// Gives every section-subject pair a teacher. Teachers specialise: each takes
/// one or two subjects and carries them across grades, which is how a school
/// actually timetables rather than scattering people at random.
///
/// Subjects are sized by how many sections actually teach them — Nepali runs in
/// every grade, General Knowledge only in the kindergartens — then handed out
/// largest-first to whoever is carrying least. Plain round-robin ignores that
/// and leaves one teacher on 16 periods while another has 5.
async function seedTeaching(c) {
  const year = await c.query(
    'SELECT id, "nameBS" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping teaching assignments");
    return;
  }
  const yearId = year.rows[0].id;

  // Anyone who is not teaching staff stays out of the timetable.
  const staff = await c.query(
    `SELECT id, "fullName", designation FROM "Staff"
     WHERE "isActive" = true AND designation !~* 'account|clerk|admin|peon|driver'
     ORDER BY id`,
  );
  if (!staff.rowCount) {
    console.log("no teaching staff — skipping assignments");
    return;
  }

  if (process.argv.includes("--reassign")) {
    const cleared = await c.query(
      `DELETE FROM "TeacherAssignment" ta
       USING "Section" s
       WHERE s.id = ta."sectionId" AND s."academicYearId" = $1`,
      [yearId],
    );
    console.log(`cleared ${cleared.rowCount} existing assignment(s) for reassignment`);
  }

  // Every section-subject pair that needs a teacher this year.
  const pairs = await c.query(
    `SELECT s.id AS "sectionId", o.id AS "offeringId", o."subjectId"
     FROM "Section" s
     JOIN "SubjectOffering" o
       ON o."gradeId" = s."gradeId" AND o."academicYearId" = s."academicYearId"
     WHERE s."academicYearId" = $1`,
    [yearId],
  );

  const taken = await c.query(
    `SELECT ta."sectionId", ta."subjectOfferingId" FROM "TeacherAssignment" ta
     JOIN "Section" s ON s.id = ta."sectionId" WHERE s."academicYearId" = $1`,
    [yearId],
  );
  const done = new Set(taken.rows.map((r) => `${r.sectionId}:${r.subjectOfferingId}`));

  const outstanding = pairs.rows.filter(
    (r) => !done.has(`${r.sectionId}:${r.offeringId}`),
  );

  // Weight each subject by how much work it actually represents.
  const weight = new Map();
  for (const row of outstanding) {
    weight.set(row.subjectId, (weight.get(row.subjectId) ?? 0) + 1);
  }

  const load = new Map(staff.rows.map((t) => [t.id, 0]));
  const existing = await c.query(
    `SELECT ta."staffId", count(*)::int n FROM "TeacherAssignment" ta
     JOIN "Section" s ON s.id = ta."sectionId"
     WHERE s."academicYearId" = $1 GROUP BY ta."staffId"`,
    [yearId],
  );
  for (const row of existing.rows) {
    if (load.has(row.staffId)) load.set(row.staffId, row.n);
  }

  // Largest subject first to whoever is carrying least: a longest-processing-time
  // fit, which keeps the spread tight without splitting a subject across staff.
  const owner = new Map();
  const ordered = [...weight.entries()].sort((a, b) => b[1] - a[1]);
  for (const [subjectId, size] of ordered) {
    const lightest = staff.rows.reduce((best, t) =>
      (load.get(t.id) ?? 0) < (load.get(best.id) ?? 0) ? t : best,
    );
    owner.set(subjectId, lightest);
    load.set(lightest.id, (load.get(lightest.id) ?? 0) + size);
  }

  let added = 0;
  for (const row of outstanding) {
    const teacher = owner.get(row.subjectId) ?? staff.rows[0];
    await c.query(
      'INSERT INTO "TeacherAssignment" ("staffId","sectionId","subjectOfferingId") VALUES ($1,$2,$3)',
      [teacher.id, row.sectionId, row.offeringId],
    );
    added++;
  }

  console.log(
    `teaching: ${added} assignment(s) added, ${pairs.rowCount - outstanding.length} already set`,
  );

  const summary = await c.query(
    `SELECT st."fullName", st.designation, count(*)::int n,
            count(DISTINCT o."subjectId")::int subjects
     FROM "TeacherAssignment" ta
     JOIN "Staff" st ON st.id = ta."staffId"
     JOIN "Section" s ON s.id = ta."sectionId"
     JOIN "SubjectOffering" o ON o.id = ta."subjectOfferingId"
     WHERE s."academicYearId" = $1
     GROUP BY st.id, st."fullName", st.designation
     ORDER BY n DESC`,
    [yearId],
  );
  console.table(summary.rows);
}

/// Fills roll calls from the start of the year up to today, skipping Saturdays
/// (the Nepali weekend) and any day already taken.
async function seedAttendance(c) {
  const year = await c.query(
    'SELECT id, "startsOn", "endsOn" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping attendance");
    return;
  }
  const { id: yearId, startsOn, endsOn } = year.rows[0];

  const today = new Date();
  const last = new Date(Math.min(new Date(endsOn).getTime(), today.getTime()));
  const sections = await c.query(
    'SELECT id FROM "Section" WHERE "academicYearId" = $1',
    [yearId],
  );

  const rand = rng(778899);
  let sessions = 0;
  let records = 0;

  for (const section of sections.rows) {
    const roll = await c.query(
      'SELECT "studentId" FROM "Enrollment" WHERE "sectionId" = $1 AND "academicYearId" = $2',
      [section.id, yearId],
    );
    if (!roll.rowCount) continue;

    const cursor = new Date(startsOn);
    while (cursor <= last) {
      // 6 = Saturday, the weekly holiday in Nepal.
      if (cursor.getUTCDay() === 6) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }
      const day = cursor.toISOString().slice(0, 10);

      const exists = await c.query(
        'SELECT id FROM "AttendanceSession" WHERE "sectionId" = $1 AND date = $2',
        [section.id, day],
      );
      if (exists.rowCount) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // A few days a term go unrecorded, which is what real registers look like.
      if (rand() < 0.08) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const s = await c.query(
        'INSERT INTO "AttendanceSession" ("sectionId","academicYearId",date) VALUES ($1,$2,$3) RETURNING id',
        [section.id, yearId, day],
      );
      sessions++;

      for (const r of roll.rows) {
        const draw = rand();
        let status = "PRESENT";
        let note = null;
        if (draw > 0.965) {
          status = "LEAVE";
          note = ["Family function", "Unwell", "Out of town", "Medical appointment"][
            Math.floor(rand() * 4)
          ];
        } else if (draw > 0.93) status = "ABSENT";
        else if (draw > 0.9) status = "LATE";

        await c.query(
          'INSERT INTO "AttendanceRecord" ("sessionId","studentId",status,note) VALUES ($1,$2,$3,$4)',
          [s.rows[0].id, r.studentId, status, note],
        );
        records++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  console.log(`attendance: ${sessions} roll calls, ${records} records`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
