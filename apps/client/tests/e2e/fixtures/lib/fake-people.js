export const FIXTURE_PEOPLE = Object.freeze([
  {id: '1', name: 'Ada Yılmaz', email: 'ada@ornek.com'},
  {id: '2', name: 'Barış Kaya', email: 'baris@ornek.com'},
  {id: '3', name: 'Cem Demir', email: 'cem@ornek.com'},
]);

export function findFixturePerson(id) {
  return FIXTURE_PEOPLE.find(person => person.id === id) ?? null;
}
