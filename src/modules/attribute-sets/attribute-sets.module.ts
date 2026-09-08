import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttributeSet, AttributeSetSchema } from '../../database/schemas/attribute-set.schema';
import { AttributeSetsController } from './attribute-sets.controller';
import { AttributeSetsService } from './attribute-sets.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: AttributeSet.name, schema: AttributeSetSchema }])],
  controllers: [AttributeSetsController],
  providers: [AttributeSetsService],
})
export class AttributeSetsModule {}
