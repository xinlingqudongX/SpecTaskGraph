import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { NodeService } from './node.service';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpdateNodeStatusDto } from './dto/update-node-status.dto';
import { CreateNodeHistoryDto } from './dto/create-node-history.dto';

@Controller('node')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @Patch(':id')
  updateNode(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodeService.updateNode(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateNodeStatusDto) {
    return this.nodeService.updateStatus(id, dto.status);
  }

  @Post(':id/history')
  @HttpCode(201)
  createHistory(@Param('id') id: string, @Body() dto: CreateNodeHistoryDto) {
    return this.nodeService.createHistory(id, dto);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.nodeService.getHistory(id);
  }
}
