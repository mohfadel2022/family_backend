import prisma from '../infrastructure/database/prisma';

async function run() {
  console.log('--- Starting Cost Center Renumbering ---');

  try {
    const allCenters = await prisma.costCenter.findMany({
      orderBy: [
        { parentId: 'asc' },
        { code: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    const principals = allCenters.filter(cc => !cc.parentId);
    
    // Use a transaction or sequential updates with temp names to avoid unique constraint errors
    let pIdx = 1;
    for (const p of principals) {
      const pNewCode = `CC-${pIdx.toString().padStart(2, '0')}`;
      console.log(`Renumbering Principal: ${p.code} -> ${pNewCode}`);
      
      // Update child entries first with a temp prefix to avoid collisions with other parents
      const children = allCenters.filter(cc => cc.parentId === p.id);
      let cIdx = 1;
      
      // We'll do a two-pass for all updates to be safe
      // Pass 1: Rename to a unique temp name
      await prisma.costCenter.update({
        where: { id: p.id },
        data: { code: `TEMP-P-${p.id}` }
      });

      for (const c of children) {
        await prisma.costCenter.update({
          where: { id: c.id },
          data: { code: `TEMP-C-${c.id}` }
        });
      }

      // Pass 2: Set final codes
      await prisma.costCenter.update({
        where: { id: p.id },
        data: { code: pNewCode }
      });

      for (const c of children) {
        const cNewCode = `${pNewCode}-${cIdx.toString().padStart(2, '0')}`;
        console.log(`  Renumbering Child: ${c.code} -> ${cNewCode}`);
        await prisma.costCenter.update({
          where: { id: c.id },
          data: { code: cNewCode }
        });
        cIdx++;
      }

      pIdx++;
    }

    console.log('--- Renumbering Completed Successfully ---');
  } catch (error) {
    console.error('Error during renumbering:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
