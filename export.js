function downloadPitchWorkbook(pitches, students, instituteById, participantAge) {
  if (!window.XLSX) {
    alert('Excel library not loaded. Please refresh and try again.');
    return;
  }

  const workbook = window.XLSX.utils.book_new();

  function orderInitialPitchStudents(
    pitch,
    students,
    instituteById,
    participantAge
  ) {
    const pitchStudents = pitch.students
      .map(id =>
        students.find(
          student =>
            String(student.dbId || student.id) === String(id)
        )
      )
      .filter(Boolean);

    const ageGroups = new Map();

    pitchStudents.forEach(student => {
      const age = participantAge(student);
      const key = age == null ? 'unknown' : String(age);

      if (!ageGroups.has(key)) {
        ageGroups.set(key, []);
      }

      ageGroups.get(key).push(student);
    });

    const sortedAges = [...ageGroups.keys()].sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return Number(a) - Number(b);
    });

    const orderedStudents = [];

    sortedAges.forEach(age => {
      const byAcademy = new Map();

      ageGroups.get(age).forEach(student => {
        const academy =
          instituteById(student.instituteId)?.academyName || 'Unknown';

        if (!byAcademy.has(academy)) {
          byAcademy.set(academy, []);
        }

        byAcademy.get(academy).push(student);
      });

      const academies = [...byAcademy.keys()];
      let remaining = true;

      while (remaining) {
        remaining = false;

        academies.forEach(academy => {
          const student = byAcademy.get(academy).shift();

          if (student) {
            orderedStudents.push(student);
            remaining = true;
          }
        });
      }
    });

    return orderedStudents;
  }

  pitches.forEach((pitch, index) => {
    const rows = [
      ['Pitch Number', 'Participant ID', 'Name', 'Age', 'Academy']
    ];

    // Apply the same age-wise and academy-wise ordering to every pitch.
    const pitchStudents = orderInitialPitchStudents(
      pitch,
      students,
      instituteById,
      participantAge
    );

    pitchStudents.forEach((student, participantIndex) => {
      rows.push([
        Math.floor(
          participantIndex / Math.max(1, Number(pitch.perPitch) || 1)
        ) + 1,
        student.id,
        student.name,
        participantAge(student) ?? '',
        instituteById(student.instituteId)?.academyName || ''
      ]);
    });

    const worksheet = window.XLSX.utils.aoa_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 28 },
      { wch: 10 },
      { wch: 30 }
    ];

    const sheetName =
      `PITCH ${String(pitch.number || index + 1).padStart(2, '0')}`;

    window.XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheetName.slice(0, 31)
    );
  });

  window.XLSX.writeFile(workbook, 'district-pitches.xlsx');
}