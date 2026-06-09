import { db, plantPaletteTable } from "./index";

const plants = [
  { botanicalName: "Coprosma kirkii",                plantType: "Ground cover" },
  { botanicalName: "Coprosma acerosa",               plantType: "Ground cover" },
  { botanicalName: "Lobelia angulata",                plantType: "Ground cover" },
  { botanicalName: "Pimelea prostrata",               plantType: "Ground cover" },
  { botanicalName: "Fushia procumbens",               plantType: "Ground cover" },
  { botanicalName: "Acaena inermis purpurea",         plantType: "Ground cover" },
  { botanicalName: "Leptospermum sp.",                plantType: "Ground cover" },
  { botanicalName: "Poa cita",                        plantType: "Grass" },
  { botanicalName: "Chionochloa flavicans",           plantType: "Grass" },
  { botanicalName: "Carex testacea",                  plantType: "Grass" },
  { botanicalName: "Carex buchananii",                plantType: "Grass" },
  { botanicalName: "Carex flagellifera",              plantType: "Grass" },
  { botanicalName: "Anemanthele lessoniana",          plantType: "Grass" },
  { botanicalName: "Dianella niger",                  plantType: "Grass" },
  { botanicalName: "Carpodetus serrata",              plantType: "Shrub" },
  { botanicalName: "Veronica diosmifolia",            plantType: "Shrub" },
  { botanicalName: "Veronica wiri mist",              plantType: "Shrub" },
  { botanicalName: "Myrsine aquilona",                plantType: "Shrub" },
  { botanicalName: "Muehlenbeckia astonii",           plantType: "Shrub" },
  { botanicalName: "Corokia cotoneaster",             plantType: "Shrub" },
  { botanicalName: "Corokia geentys green",           plantType: "Shrub" },
  { botanicalName: "Corokia red wonder",              plantType: "Shrub" },
  { botanicalName: "Pseudopanax lessonii",            plantType: "Tree" },
  { botanicalName: "Pseudopanax laetus",              plantType: "Tree" },
  { botanicalName: "Pseudopanax crassifolius",        plantType: "Tree" },
  { botanicalName: "Pseudopanax ferox",               plantType: "Tree" },
  { botanicalName: "Pittosporum tenuifolium",         plantType: "Tree" },
  { botanicalName: "Leptospermum scoparium",          plantType: "Tree" },
  { botanicalName: "Plagianthus regius",              plantType: "Tree" },
  { botanicalName: "Aristotelia serrata",             plantType: "Tree" },
  { botanicalName: "Griselinia lucida",               plantType: "Tree" },
  { botanicalName: "Griselinia littoralis",           plantType: "Tree" },
  { botanicalName: "Asplenium bulbiferum",            plantType: "Fern" },
  { botanicalName: "Blechnum discolour",              plantType: "Fern" },
  { botanicalName: "Austroblechnum penna-marina",     plantType: "Fern" },
  { botanicalName: "Parablechnum novae-zelandiae",    plantType: "Fern" },
  { botanicalName: "Polystichum rigens",              plantType: "Fern" },
  { botanicalName: "Doodia australis",                plantType: "Fern" },
  { botanicalName: "Arthropodium serrata",            plantType: "Herbaceous perennial" },
];

async function seed() {
  console.log(`Seeding ${plants.length} plants…`);
  await db
    .insert(plantPaletteTable)
    .values(plants)
    .onConflictDoNothing();
  console.log("Done.");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
