import 'package:flutter_test/flutter_test.dart';
import 'package:pago_santacasapg/models/clinical_models.dart';

void main() {
  test('Non-destructive Parity, High Risk, and Admission parsers preserve spreadsheet text', () {
    final p = ParsedParity.parse('G4C3A1 (última há 2 anos)');
    expect(p.values['G'], 4);
    expect(p.values['P'], 0);
    expect(p.values['C'], 3);
    expect(p.values['A'], 1);
    expect(p.extraText, '(última há 2 anos)');
    expect(p.toSheetString(), 'G4C3A1 (última há 2 anos)');

    final hr = ParsedHighRisk.parse('DMG A2 ID + ITU de repetição + TAG');
    expect(hr.selectedCodes.contains('DMG'), true);
    expect(hr.selectedCodes.contains('ITU'), true);
    expect(hr.selectedCodes.contains('OUTROS'), true);
    expect(hr.otherText, 'TAG');

    final adm = ParsedAdmissionReason.parse('PN em 20/11 às 02h18 (mas. 4270 9/10)');
    expect(adm.selectedOption, 'PN');
    expect(adm.birthDate, '2026-11-20');
    expect(adm.birthTime, '02:18');
    expect(adm.extraText, '(mas. 4270 9/10)');
  });
}
