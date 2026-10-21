
function downloadPitchWorkbook(pitches, students, instituteById, participantAge) {
  if (!window.XLSX) {
    alert('Excel library not loaded. Please refresh and try again.');
    return;
  }

  const workbook = window.XLSX.utils.book_new();

  pitches.forEach((pitch, index) => {
    const rows = [
      ['Pitch Number', 'Participant ID', 'Name', 'Age', 'Academy']
    ];

    pitch.students.forEach((id, participantIndex) => {
      const student = students.find(
        item => String(item.dbId || item.id) === String(id)
      );

      if (!student) return;

      rows.push([
        Math.floor(participantIndex / Math.max(1, Number(pitch.perPitch) || 1)) + 1,
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

    const sheetName = `PITCH ${String(pitch.number || index + 1).padStart(2, '0')}`;

    window.XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheetName.slice(0, 31)
    );
  });

  window.XLSX.writeFile(workbook, 'district-pitches.xlsx');
}
